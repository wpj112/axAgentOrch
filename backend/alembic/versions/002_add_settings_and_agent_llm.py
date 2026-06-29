"""add global_settings table and agent llm overrides

Revision ID: 002
Revises: 7fed9bc124e5
Create Date: 2025-06-29 22:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, None] = '7fed9bc124e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'global_settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.add_column('agents', sa.Column('llm_model', sa.String(255), nullable=True))
    op.add_column('agents', sa.Column('llm_temperature', sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column('agents', 'llm_temperature')
    op.drop_column('agents', 'llm_model')
    op.drop_table('global_settings')
