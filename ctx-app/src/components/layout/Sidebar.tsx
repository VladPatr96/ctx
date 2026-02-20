export type AppTab = 'dashboard' | 'knowledge' | 'agents' | 'settings' | 'terminal';

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: 'dashboard', label: 'Pipeline' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'agents', label: 'Agents' },
  { id: 'settings', label: 'Settings' },
  { id: 'terminal', label: 'Terminal' }
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="logo">CTX</div>
      <nav>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? 'nav-btn active' : 'nav-btn'}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
