import { describe, expect, it } from 'vitest';
import { explainWorkspaceError } from '../services/workspaceService';

describe('workspace database error messages', () => {
  it('explains a missing workspaces table and identifies the migration to apply', () => {
    const message = explainWorkspaceError({
      code: 'PGRST205',
      message: "Could not find the table 'public.workspaces' in the schema cache",
    });

    expect(message).toContain('workspace tables are not available');
    expect(message).toContain('20261117_workspace_base_schema.sql');
    expect(message).toContain('Verify the project URL');
  });

  it('explains that workspace creation must use the authenticated RPC after a stale direct-insert failure', () => {
    const message = explainWorkspaceError({
      code: '42501',
      message: 'new row violates row-level security policy for table "workspaces"',
      details: 'Failing row contains owner_id 00000000-0000-0000-0000-000000000001.',
    });
    expect(message).toContain('workspaces table directly');
    expect(message).toContain('create_workspace RPC');
    expect(message).toContain('rebuild and redeploy');
    expect(message).toContain('Frontend project:');
  });

  it('preserves actionable database messages that do not match known cases', () => {
    expect(explainWorkspaceError({ code: '23505', message: 'workspace slug already exists' })).toBe('workspace slug already exists');
  });
});
