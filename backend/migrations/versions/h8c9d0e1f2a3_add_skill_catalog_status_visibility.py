"""add skill catalog status and visibility semantics

Revision ID: h8c9d0e1f2a3
Revises: g7b8c9d0e1f2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "g7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "skills",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
    )
    op.add_column(
        "skills",
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="global"),
    )

    op.execute(sa.text("UPDATE skills SET status = 'published' WHERE status = 'draft'"))
    op.execute(sa.text("UPDATE skills SET visibility = 'global' WHERE visibility <> 'global' OR visibility IS NULL"))
    op.execute(sa.text("UPDATE skills SET scope = 'global' WHERE scope <> 'global' OR scope IS NULL"))

    op.alter_column(
        "skills",
        "scope",
        existing_type=sa.String(length=20),
        server_default="global",
        existing_nullable=False,
    )

    op.create_check_constraint(
        "ck_skills_status",
        "skills",
        "status IN ('draft', 'published', 'disabled', 'deprecated')",
    )
    op.create_check_constraint(
        "ck_skills_visibility",
        "skills",
        "visibility = 'global'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_skills_visibility", "skills", type_="check")
    op.drop_constraint("ck_skills_status", "skills", type_="check")

    op.alter_column(
        "skills",
        "scope",
        existing_type=sa.String(length=20),
        server_default="user",
        existing_nullable=False,
    )

    op.drop_column("skills", "visibility")
    op.drop_column("skills", "status")
