/**
 * error-similar.js — Find similar errors in Knowledge Base
 */

/**
 * Main command handler
 */
export default async function errorSimilar(args, ctx) {
  const { storage, appendLog } = ctx || {};
  
  const pattern = args.pattern || '';
  
  if (!pattern) {
    return {
      error: 'Missing --pattern argument',
      usage: 'error-similar --pattern "<error pattern>"'
    };
  }
  
  if (!storage) {
    return {
      error: 'Knowledge Base not available',
      hint: 'KB must be enabled for this command'
    };
  }
  
  try {
    // Search KB for similar errors
    const results = await storage.searchKnowledge(pattern, { 
      limit: 10,
      type: 'bugfix'
    });
    
    // Group by solution pattern
    const solutionGroups = {};
    
    for (const result of results) {
      const solution = result.metadata?.solution || 'Unknown solution';
      
      if (!solutionGroups[solution]) {
        solutionGroups[solution] = {
          count: 0,
          avgTimeToFix: 0,
          examples: []
        };
      }
      
      solutionGroups[solution].count++;
      
      if (result.metadata?.timeToFix) {
        solutionGroups[solution].avgTimeToFix += result.metadata.timeToFix;
      }
      
      if (solutionGroups[solution].examples.length < 3) {
        solutionGroups[solution].examples.push({
          date: result.created_at,
          file: result.metadata?.file,
          line: result.metadata?.line
        });
      }
    }
    
    // Calculate averages and sort
    const matches = Object.entries(solutionGroups)
      .map(([solution, data]) => ({
        solution,
        count: data.count,
        avgTimeToFix: data.count > 0 
          ? Math.round(data.avgTimeToFix / data.count * 10) / 10 
          : 0,
        examples: data.examples
      }))
      .sort((a, b) => b.count - a.count);
    
    const result = {
      pattern: pattern,
      totalMatches: results.length,
      matches: matches,
      searchedAt: new Date().toISOString()
    };
    
    // Log to CTX
    if (appendLog) {
      appendLog({
        action: 'error_similar',
        pattern: pattern,
        matches: results.length
      });
    }
    
    return result;
    
  } catch (error) {
    return {
      error: 'Failed to search Knowledge Base',
      details: error.message
    };
  }
}
