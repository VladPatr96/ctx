import { LayoutDashboard, BookOpen, Users, GitBranch, Settings, Terminal, Workflow, Bot, MessageSquareMore, Command, type LucideIcon } from 'lucide-react';
import { SHELL_TABS } from '../../../../scripts/contracts/shell-schemas.js';

export type AppTab = 'command' | 'dashboard' | 'knowledge' | 'agents' | 'routing' | 'devpipeline' | 'orchestrator' | 'debates' | 'settings' | 'terminal';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TAB_ICONS: Record<string, LucideIcon> = {
  command: Command,
  'layout-dashboard': LayoutDashboard,
  'book-open': BookOpen,
  users: Users,
  'git-branch': GitBranch,
  workflow: Workflow,
  bot: Bot,
  'message-square-more': MessageSquareMore,
  settings: Settings,
  terminal: Terminal,
};

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="logo">CTX</div>
      <nav>
        {SHELL_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.icon] || LayoutDashboard;
          return (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? 'nav-btn active' : 'nav-btn'}
              onClick={() => onTabChange(tab.id as AppTab)}
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
