import { useState } from 'react';
import type { KBStats } from '../../api/types';

interface KBFiltersProps {
  stats: KBStats;
  onFilterChange: (filters: { category?: string; project?: string }) => void;
}

export function KBFilters({ stats, onFilterChange }: KBFiltersProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');

  const categories = Object.keys(stats.byCategory || {}).sort();
  const projects = Object.keys(stats.byProject || {}).sort();

  const handleCategoryChange = (category: string) => {
    const newCategory = category === selectedCategory ? '' : category;
    setSelectedCategory(newCategory);
    onFilterChange({ category: newCategory || undefined, project: selectedProject || undefined });
  };

  const handleProjectChange = (project: string) => {
    const newProject = project === selectedProject ? '' : project;
    setSelectedProject(newProject);
    onFilterChange({ category: selectedCategory || undefined, project: newProject || undefined });
  };

  const handleClearFilters = () => {
    setSelectedCategory('');
    setSelectedProject('');
    onFilterChange({});
  };

  const hasActiveFilters = selectedCategory || selectedProject;

  if (categories.length === 0 && projects.length === 0) {
    return null;
  }

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Фильтры</strong>
        {hasActiveFilters && (
          <button
            type="button"
            className="nav-btn"
            onClick={handleClearFilters}
            style={{ fontSize: 12, padding: '4px 8px' }}
          >
            Сбросить
          </button>
        )}
      </header>

      {categories.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>
            Категория
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.map((category) => {
              const count = stats.byCategory[category] || 0;
              const isActive = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleCategoryChange(category)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: isActive ? 'var(--primary)' : 'var(--surface)',
                    color: isActive ? 'white' : 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {category} <span style={{ opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>
            Проект
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {projects.map((project) => {
              const count = stats.byProject[project] || 0;
              const isActive = selectedProject === project;
              return (
                <button
                  key={project}
                  type="button"
                  onClick={() => handleProjectChange(project)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: isActive ? 'var(--primary)' : 'var(--surface)',
                    color: isActive ? 'white' : 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {project} <span style={{ opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
