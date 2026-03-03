import { LayoutDashboard, BookOpen, Users, GitBranch, Settings, Terminal, Workflow, Bot, type LucideIcon } from 'lucide-react';

export type AppTab = 'dashboard' | 'knowledge' | 'agents' | 'routing' | 'devpipeline' | 'settings' | 'terminal' | 'orchestrator';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Пайплайн', icon: LayoutDashboard },
  { id: 'knowledge', label: 'База знаний', icon: BookOpen },
  { id: 'agents', label: 'Агенты', icon: Users },
  { id: 'routing', label: 'Роутинг', icon: GitBranch },
  { id: 'devpipeline', label: 'Dev Pipeline', icon: Workflow },
  { id: 'orchestrator', label: 'Оркестратор', icon: Bot },
  { id: 'settings', label: 'Настройки', icon: Settings },
  { id: 'terminal', label: 'Терминал', icon: Terminal }
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="logo">CTX</div>
      <nav>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? 'nav-btn active' : 'nav-btn'}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
