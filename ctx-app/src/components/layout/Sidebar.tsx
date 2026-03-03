import { LayoutDashboard, BookOpen, Users, GitBranch, Settings, Terminal, type LucideIcon } from 'lucide-react';

export type AppTab = 'dashboard' | 'knowledge' | 'agents' | 'routing' | 'settings' | 'terminal';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Пайплайн', icon: LayoutDashboard },
  { id: 'knowledge', label: 'База знаний', icon: BookOpen },
  { id: 'agents', label: 'Агенты', icon: Users },
  { id: 'routing', label: 'Роутинг', icon: GitBranch },
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
