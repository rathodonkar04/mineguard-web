import React from 'react';

/**
 * Sidebar Component - Restrained Industrial Navigation Menu
 * Responsive: Desktop persistent sidebar (>= 1024px) + Mobile/Tablet drawer (< 1024px)
 */
export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  activeAlertCount = 0,
  userRole = 'operator',
  mobileOpen = false,
  onCloseMobile = null 
}) {
  const isOperator = userRole === 'operator';
  const isPlanner = userRole === 'planner';
  const isAuditor = userRole === 'auditor' || userRole === 'regulator';
  const isAdmin = userRole === 'admin';

  const navItems = [
    { id: 'dashboard', label: 'MONITOR', href: '#/', tag: isOperator ? 'SCADA' : null },
    { id: 'nodes', label: 'NODES', href: '#/' },
    { id: 'alerts', label: 'ALERTS', href: '#/alerts', badge: activeAlertCount, tag: isOperator ? 'ALERT' : null },
    { id: 'forecast', label: 'FORECAST', href: '#/forecast', tag: isPlanner ? 'KNOTHE' : null },
    { id: 'history', label: 'HISTORY', href: '#/history' },
    { id: 'network', label: 'NETWORK', href: '#/network' },
    { id: 'reports', label: 'REPORTS', href: '#/reports', tag: (isAuditor || isAdmin) ? 'DGMS' : null },
    { id: 'settings', label: 'SETTINGS', href: '#/settings', tag: isAdmin ? 'ADMIN' : null }
  ];

  const handleItemClick = (id) => {
    setActiveTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <aside className="w-56 bg-[#FFFFFF] text-[#222222] h-full flex flex-col border-r border-[#D8D8D5] shrink-0 select-none overflow-y-auto" aria-label="Main Navigation">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-[#D8D8D5] flex items-center justify-between">
        <div>
          <div className="text-xs font-bold tracking-wider text-[#3F4A42]">
            OPERATIONS MENU
          </div>
          <div className="text-[10.5px] text-[#666666] mt-0.5 font-medium flex items-center gap-1.5">
            <span>Grid P-4 •</span>
            <span className="font-mono text-[9.5px] font-bold uppercase text-[#3F7655]">
              {userRole === 'auditor' || userRole === 'regulator' ? 'AUDITOR' : userRole.toUpperCase()}
            </span>
          </div>
        </div>
        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="lg:hidden text-xs font-bold text-[#666666] hover:text-[#222222] px-2 py-1 bg-[#F7F7F5] border border-[#D8D8D5]"
            aria-label="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <a
              key={item.id}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                handleItemClick(item.id);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full text-left px-5 py-2.5 text-xs font-semibold tracking-wide flex items-center justify-between border-l-2 transition-colors ${
                isActive
                  ? 'bg-[#F7F7F5] text-[#3F4A42] border-[#3F4A42] font-bold'
                  : 'text-[#666666] hover:text-[#222222] hover:bg-[#F7F7F5]/60 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{item.label}</span>
                {item.tag && (
                  <span className="text-[9px] px-1 py-0.2 bg-[#F0FDF4] text-[#3F7655] border border-[#BBF7D0] font-mono font-bold">
                    {item.tag}
                  </span>
                )}
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 bg-[#A84444] text-[#FFFFFF] font-bold">
                  {item.badge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Hardware Status Footer */}
      <div className="p-4 border-t border-[#D8D8D5] bg-[#F7F7F5] text-[11px] text-[#666666] space-y-1">
        <div className="text-[#222222] font-semibold text-xs">
          NETWORK STATUS
        </div>
        <div>Topology: 4 Nodes</div>
        <div>Protocol: ESP-NOW</div>
        <div>Gateway: Node 3 (Root)</div>
      </div>
    </aside>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar (>= 1024px) */}
      <div className="hidden lg:block shrink-0 sticky top-0 h-screen">
        {navContent}
      </div>

      {/* 2. Mobile & Tablet Drawer Overlay (< 1024px) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          {/* Slide-in Sidebar Panel */}
          <div className="relative z-10 h-full shadow-lg">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
