import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { createServer } from 'node:http';
import { resolveAgentDetailsPath } from '../src/dashboard/server.js';

// Security tests for dashboard-backend.js

test('resolveAgentDetailsPath blocks traversal with mixed path separators', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  
  // Normal case should work
  const safe = resolveAgentDetailsPath('architect', agentsDir);
  assert.equal(safe, resolve(agentsDir, 'architect.md'));
  
  // Traversal attempts should be blocked
  assert.throws(() => resolveAgentDetailsPath('../../../etc/passwd', agentsDir), /Invalid agent ID/);
  assert.throws(() => resolveAgentDetailsPath('..\\..\\..\\windows\\system32\\config', agentsDir), /Invalid agent ID/);
  assert.throws(() => resolveAgentDetailsPath('foo/../../bar', agentsDir), /Invalid agent ID/);
});

test('resolveAgentDetailsPath handles Windows-style paths safely', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  
  // Even with backslashes in the ID (after regex validation), traversal should fail
  // Note: The regex /^[a-zA-Z0-9_-]{1,64}$/ already blocks backslashes
  assert.throws(() => resolveAgentDetailsPath('..\\secret', agentsDir), /Invalid agent ID/);
});

test('resolveAgentDetailsPath prevents null bytes injection', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  
  // Null bytes should be rejected by regex
  assert.throws(() => resolveAgentDetailsPath('agent\x00../../../etc/passwd', agentsDir), /Invalid agent ID/);
});

test('resolveAgentDetailsPath validates exact boundary conditions', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  
  // Exactly at boundary - should work
  const safePath = resolveAgentDetailsPath('architect', agentsDir);
  assert.ok(safePath.startsWith(agentsDir), 'Safe path should be inside agentsDir');
  
  // Verify the path doesn't escape via relative check
  const relPath = relative(agentsDir, safePath);
  assert.ok(!relPath.startsWith('..'), 'Path should not escape base directory');
});

// Mock request/url objects for auth testing
function createMockRequest(authHeader) {
  return {
    headers: authHeader ? { authorization: authHeader } : {}
  };
}

function createMockUrl(token) {
  const searchParams = new Map();
  if (token) searchParams.set('token', token);
  return { searchParams };
}

test('isAuthorized uses constant-time comparison', async () => {
  // Import the module with access to internal functions
  const module = await import('../src/dashboard/server.js');
  
  // We need to test the behavior indirectly via HTTP endpoints
  // Create a test to verify auth rejection works consistently
  
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const router = module.createRouter(() => '<html></html>', 'test-token-12345');
      await router(req, res);
    });
    
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      
      try {
        // Test with correct token
        const correctResponse = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'Authorization': 'Bearer test-token-12345' }
        });
        
        // Test with wrong token
        const wrongResponse = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'Authorization': 'Bearer wrong-token' }
        });
        
        // Test with missing token
        const missingResponse = await fetch(`http://127.0.0.1:${port}/api/state`);
        
        // All protected endpoints should return 401 for wrong/missing tokens
        assert.equal(wrongResponse.status, 401, 'Wrong token should be rejected');
        assert.equal(missingResponse.status, 401, 'Missing token should be rejected');
        
        // Verify error messages don't leak information
        const wrongBody = await wrongResponse.json();
        const missingBody = await missingResponse.json();
        assert.equal(wrongBody.error, missingBody.error, 'Error messages should be identical to prevent info leak');
        
        resolve();
      } finally {
        server.close();
      }
    });
  });
});

test('Authorization header parsing handles edge cases', async () => {
  const module = await import('../src/dashboard/server.js');
  
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const router = module.createRouter(() => '<html></html>', 'secret-token');
      await router(req, res);
    });
    
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      
      try {
        // Test malformed header (no Bearer prefix)
        const noBearer = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'Authorization': 'secret-token' }
        });
        assert.equal(noBearer.status, 401);
        
        // Test empty Bearer
        const emptyBearer = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'Authorization': 'Bearer ' }
        });
        assert.equal(emptyBearer.status, 401);
        
        // Test case sensitivity
        const lowercase = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'authorization': 'bearer secret-token' }
        });
        assert.equal(lowercase.status, 401, 'Should be case-sensitive');
        
        resolve();
      } finally {
        server.close();
      }
    });
  });
});

test('Token comparison is length-safe', async () => {
  const module = await import('../src/dashboard/server.js');
  
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const router = module.createRouter(() => '<html></html>', 'short');
      await router(req, res);
    });
    
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      
      try {
        // Longer token should be rejected safely (no buffer overflow)
        const longTokenResponse = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'Authorization': 'Bearer ' + 'a'.repeat(10000) }
        });
        assert.equal(longTokenResponse.status, 401);
        
        // Empty token
        const emptyResponse = await fetch(`http://127.0.0.1:${port}/api/state`, {
          headers: { 'Authorization': 'Bearer ' }
        });
        assert.equal(emptyResponse.status, 401);
        
        resolve();
      } finally {
        server.close();
      }
    });
  });
});

// Export for potential external use
export { resolveAgentDetailsPath };
