"""add parent_id to nodes and source_handle to edges

Revision ID: 003
Revises: 002
Create Date: 2025-06-30 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('nodes', sa.Column('parent_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(None, 'nodes', 'nodes', ['parent_id'], ['id'])
    op.add_column('edges', sa.Column('source_handle', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_constraint(None, 'nodes', type_='foreignkey')
    op.drop_column('nodes', 'parent_id')
    op.drop_column('edges', 'source_handle')
