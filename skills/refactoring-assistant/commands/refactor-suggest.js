/**
 * refactor-suggest.js — Предложения по паттернам рефакторинга
 */

export default async function refactorSuggest(args, ctx) {
  const { appendLog } = ctx || {};
  
  const pattern = args.pattern || 'all';
  
  const patterns = {
    'extract-method': {
      name: 'Extract Method',
      description: 'Turn code fragment into a method',
      when: 'Long method, duplicate code',
      steps: [
        'Create new method',
        'Copy code to new method',
        'Replace original with method call'
      ]
    },
    'extract-class': {
      name: 'Extract Class',
      description: 'Create new class from existing one',
      when: 'God object, too many responsibilities',
      steps: [
        'Identify cohesive subset',
        'Create new class',
        'Move methods and fields',
        'Update references'
      ]
    },
    'replace-conditional': {
      name: 'Replace Conditional with Polymorphism',
      description: 'Move conditionals to subclasses',
      when: 'Complex switch/if-else chains',
      steps: [
        'Create inheritance hierarchy',
        'Move each branch to subclass',
        'Replace conditional with polymorphic call'
      ]
    },
    'introduce-strategy': {
      name: 'Introduce Strategy Pattern',
      description: 'Extract algorithms into strategy objects',
      when: 'Multiple ways to do something',
      steps: [
        'Define strategy interface',
        'Implement concrete strategies',
        'Inject strategy via constructor'
      ]
    }
  };
  
  if (pattern === 'all') {
    const result = {
      patterns: Object.entries(patterns).map(([key, value]) => ({
        pattern: key,
        ...value
      }))
    };
    
    if (appendLog) {
      appendLog({ action: 'refactor_suggest', pattern: 'all' });
    }
    
    return result;
  }
  
  if (!patterns[pattern]) {
    return {
      error: `Unknown pattern: ${pattern}`,
      available: Object.keys(patterns)
    };
  }
  
  const result = {
    pattern,
    ...patterns[pattern]
  };
  
  if (appendLog) {
    appendLog({ action: 'refactor_suggest', pattern });
  }
  
  return result;
}
