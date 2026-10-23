import socket
import uuid

import httpx
import pytest
from fastapi import HTTPException

from app.services.website import FetchedPage, WebsiteCrawler, WebsiteFetchError, WebsiteService


def test_website_normalization_accepts_public_http_urls() -> None:
    assert WebsiteCrawler._normalize_url("https://Example.com") == "https://example.com/"


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://10.0.0.5/",
        "http://localhost/",
        "http://example.com:8080/",
        "file:///etc/passwd",
    ],
)
def test_website_normalization_rejects_private_or_unsupported_urls(url: str) -> None:
    with pytest.raises(WebsiteFetchError):
        WebsiteCrawler._normalize_url(url)


def test_page_parser_omits_script_content_and_reads_titles_and_links() -> None:
    from app.services.website import _PageParser

    parser = _PageParser()
    parser.feed(
        "<html><head><title>Business page</title><script>secret()</script></head>"
        "<body><p>Opening hours</p><a href='/about'>About</a></body></html>"
    )

    assert " ".join(parser.title_parts) == "Business page"
    assert " ".join(parser.text_parts) == "Opening hours About"
    assert parser.links == ["/about"]


@pytest.mark.asyncio
async def test_scan_discovers_only_same_host_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeCrawler(WebsiteCrawler):
        async def _fetch_page(self, url: str, root_host: str) -> FetchedPage:
            if url.endswith("/"):
                links = [
                    "https://example.com/about",
                    "https://example.com/contact",
                    "https://other.example/about",
                    "http://127.0.0.1/admin",
                ]
            else:
                links = []
            return FetchedPage(url=url, title=url.rsplit("/", 1)[-1] or "Home", text="Business details", links=links)

    monkeypatch.setattr("app.services.website.MAX_PAGES", 5)
    pages = await FakeCrawler().scan("https://example.com/")

    assert {page.url for page in pages} == {
        "https://example.com/",
        "https://example.com/about",
        "https://example.com/contact",
    }


@pytest.mark.asyncio
async def test_scan_rejects_private_dns_results(monkeypatch: pytest.MonkeyPatch) -> None:
    def resolve_private(*args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.10", 443))]

    monkeypatch.setattr("app.services.website.socket.getaddrinfo", resolve_private)

    with pytest.raises(WebsiteFetchError, match="not publicly accessible"):
        await WebsiteCrawler()._resolve_public_addresses("example.com", 443)


@pytest.mark.asyncio
async def test_fetch_page_uses_pinned_address_and_extracts_real_page_html() -> None:
    requests: list[httpx.Request] = []

    async def resolve(host: str, port: int) -> dict[str, str]:
        assert host == "example.com"
        assert port == 443
        return {host: "93.184.216.34"}

    async def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            text=(
                "<html><head><title>Business</title></head><body>"
                "<p>Opening hours</p><a href='/about'>About</a></body></html>"
            ),
        )

    crawler = WebsiteCrawler(
        resolver=resolve,
        transport_factory=lambda _addresses: httpx.MockTransport(respond),
    )
    page = await crawler._fetch_page("https://example.com/", "example.com")

    assert page.title == "Business"
    assert page.text == "Opening hours About"
    assert page.links == ["https://example.com/about"]
    assert requests[0].url.host == "example.com"


@pytest.mark.asyncio
async def test_fetch_page_rejects_redirects_to_private_addresses() -> None:
    async def resolve(host: str, port: int) -> dict[str, str]:
        return {host: "93.184.216.34"}

    async def redirect_to_private(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})

    crawler = WebsiteCrawler(
        resolver=resolve,
        transport_factory=lambda _addresses: httpx.MockTransport(redirect_to_private),
    )

    with pytest.raises(WebsiteFetchError, match="same website"):
        await crawler._fetch_page("https://example.com/", "example.com")


@pytest.mark.asyncio
async def test_import_rejects_pages_from_another_host_before_fetching() -> None:
    class FakeCrawler(WebsiteCrawler):
        async def fetch_selected(self, base_url: str, selected_urls: list[str]) -> list[FetchedPage]:
            return await super().fetch_selected(base_url, selected_urls)

    service = WebsiteService(db=None, crawler=FakeCrawler())

    with pytest.raises(HTTPException) as error:
        await service.import_pages(
            uuid.uuid4(),
            "https://example.com/",
            ["https://other.example/page"],
        )

    assert error.value.status_code == 422
