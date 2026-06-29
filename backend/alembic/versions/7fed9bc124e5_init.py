"""init

Revision ID: 7fed9bc124e5
Revises: 
Create Date: 2026-06-29 14:56:57.542496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7fed9bc124e5'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'agents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), unique=True, nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        'nodes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('config', postgresql.JSONB(), nullable=False),
        sa.Column('position_x', sa.Float(), nullable=False),
        sa.Column('position_y', sa.Float(), nullable=False),
    )
    op.create_foreign_key(None, 'nodes', 'agents', ['agent_id'], ['id'])
    op.create_table(
        'edges',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_node_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('target_node_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('condition', sa.Text(), nullable=True),
    )
    op.create_foreign_key(None, 'edges', 'agents', ['agent_id'], ['id'])
    op.create_foreign_key(None, 'edges', 'nodes', ['source_node_id'], ['id'])
    op.create_foreign_key(None, 'edges', 'nodes', ['target_node_id'], ['id'])
    op.create_table(
        'executions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('input', postgresql.JSONB(), nullable=False),
        sa.Column('output', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(None, 'executions', 'agents', ['agent_id'], ['id'])


def downgrade() -> None:
    op.drop_table('executions')
    op.drop_table('edges')
    op.drop_table('nodes')
    op.drop_table('agents')
