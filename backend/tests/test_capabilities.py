from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.schemas.capability import AgentCapabilityUpdate, ConfigField
from app.services.capability import CapabilityService, validate_config


def field(**values) -> ConfigField:
    base = {"key": "value", "type": "text", "label": {"he": "שדה", "en": "Field"}}
    return ConfigField.model_validate({**base, **values})


class FakeResult:
    def __init__(self, scalar=None, items=None) -> None:
        self._scalar, self._items = scalar, items or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return SimpleNamespace(all=lambda: self._items)


class FakeDb:
    def __init__(self, *results: FakeResult) -> None:
        self.results = list(results)
        self.added: list = []
        self.commits = 0

    async def execute(self, *_args, **_kwargs):
        return self.results.pop(0)

    def add(self, item) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1


def capability(**overrides):
    values = {
        "id": uuid4(),
        "locked": False,
        "default_enabled": False,
        "enabled": True,
        "config_fields": [
            {"key": "notificationEmail", "type": "email", "label": {"he": "מייל", "en": "Email"}, "required": True}
        ],
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_required_fields_are_enforced_only_when_enabled() -> None:
    fields = [field(key="email", type="email", required=True)]

    assert validate_config(fields, {}, enabled=False) == {}
    with pytest.raises(HTTPException) as error:
        validate_config(fields, {}, enabled=True)
    assert error.value.status_code == 422


def test_unknown_keys_and_invalid_values_are_rejected() -> None:
    fields = [field(key="email", type="email"), field(key="length", type="number", min=5, max=60)]

    for config in ({"other": 1}, {"email": "not-an-email"}, {"length": 2}, {"length": True}):
        with pytest.raises(HTTPException):
            validate_config(fields, config, enabled=True)
    assert validate_config(fields, {"email": " a@b.co ", "length": 30}, enabled=True) == {"email": "a@b.co", "length": 30}


def test_select_and_multiselect_accept_only_listed_options() -> None:
    options = [{"value": "a", "label": {"he": "א", "en": "A"}}, {"value": "b", "label": {"he": "ב", "en": "B"}}]
    fields = [field(key="one", type="select", options=options), field(key="many", type="multiselect", options=options)]

    assert validate_config(fields, {"one": "a", "many": ["a", "b"]}, enabled=True) == {"one": "a", "many": ["a", "b"]}
    for config in ({"one": "c"}, {"many": ["a", "a"]}, {"many": ["z"]}):
        with pytest.raises(HTTPException):
            validate_config(fields, config, enabled=True)


def test_lead_fields_validation() -> None:
    fields = [field(key="fields", type="lead_fields")]
    good = [{"key": "name", "label": "Name", "required": True}]

    assert validate_config(fields, {"fields": good}, enabled=True) == {"fields": good}
    for bad in ([{"key": "name", "label": "A"}, {"key": "name", "label": "B"}], [{"key": "x", "label": " "}], ["x"]):
        with pytest.raises(HTTPException):
            validate_config(fields, {"fields": bad}, enabled=True)


def test_weekly_availability_validation() -> None:
    fields = [field(key="availability", type="weekly_availability")]
    good = {"mon": [{"start": "13:00", "end": "17:00"}, {"start": "09:00", "end": "12:00"}], "tue": []}

    assert validate_config(fields, {"availability": good}, enabled=True) == {
        "availability": {"mon": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]}
    }
    bad_values = [
        {"xyz": []},
        {"mon": [{"start": "10:00", "end": "09:00"}]},
        {"mon": [{"start": "9:00", "end": "10:00"}]},
        {"mon": [{"start": "09:00", "end": "11:00"}, {"start": "10:00", "end": "12:00"}]},
    ]
    for bad in bad_values:
        with pytest.raises(HTTPException):
            validate_config(fields, {"availability": bad}, enabled=True)


@pytest.mark.asyncio
async def test_locked_capability_cannot_be_enabled() -> None:
    service = CapabilityService(FakeDb(FakeResult(scalar=SimpleNamespace()), FakeResult(scalar=capability(locked=True))))

    with pytest.raises(HTTPException) as error:
        await service.set_agent_capability(uuid4(), uuid4(), AgentCapabilityUpdate(enabled=True), uuid4())

    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_capability_of_another_users_agent_is_not_found() -> None:
    service = CapabilityService(FakeDb(FakeResult(scalar=None)))

    with pytest.raises(HTTPException) as error:
        await service.set_agent_capability(uuid4(), uuid4(), AgentCapabilityUpdate(enabled=False), uuid4())

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_saving_creates_link_with_validated_config() -> None:
    db = FakeDb(FakeResult(scalar=SimpleNamespace()), FakeResult(scalar=capability()), FakeResult(scalar=None))
    result = await CapabilityService(db).set_agent_capability(
        uuid4(), uuid4(), AgentCapabilityUpdate(enabled=True, config={"notificationEmail": "me@example.com"}), uuid4()
    )

    assert result.enabled is True
    assert result.config == {"notificationEmail": "me@example.com"}
    assert len(db.added) == 1 and db.commits == 1


@pytest.mark.asyncio
async def test_agent_listing_applies_defaults_and_hides_locked_state() -> None:
    open_capability = capability(default_enabled=True)
    locked_capability = capability(locked=True, default_enabled=True)
    stored = SimpleNamespace(capability_id=open_capability.id, enabled=False, config={"a": 1})
    db = FakeDb(
        FakeResult(scalar=SimpleNamespace()),
        FakeResult(items=[open_capability, locked_capability]),
        FakeResult(items=[stored]),
    )

    result = await CapabilityService(db).list_agent_capabilities(uuid4(), uuid4())

    assert [(item.enabled, item.config) for item in result] == [(False, {"a": 1}), (False, {})]
