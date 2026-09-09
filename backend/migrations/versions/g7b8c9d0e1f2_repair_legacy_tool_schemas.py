"""repair legacy tool schemas

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE tools SET input_schema = '{}'::json WHERE input_schema IS NULL"))
    op.execute(sa.text("UPDATE tools SET output_schema = '{}'::json WHERE output_schema IS NULL"))
    op.alter_column("tools", "input_schema", existing_type=sa.JSON(), nullable=False)
    op.alter_column("tools", "output_schema", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.alter_column("tools", "input_schema", existing_type=sa.JSON(), nullable=True)
    op.alter_column("tools", "output_schema", existing_type=sa.JSON(), nullable=True)