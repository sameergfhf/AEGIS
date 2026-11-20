import { describe, expect, it } from 'vitest';
import { explainWorkspaceError } from '../services/workspaceService';

describe('workspace database error messages', () => {
  it('preserves error message from standard error', () => {
    expect(explainWorkspaceError(new Error('workspace slug already exists'))).toBe('workspace slug already exists');
  });

  it('handles unexpected error gracefully', () => {
    expect(explainWorkspaceError(null)).toBe('An unexpected workspace error occurred.');
  });
});
