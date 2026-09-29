import React, { useEffect, useMemo, useState } from 'react';

/*
 * Grouped sidebar navigation.
 *
 * Every portal is limited to exactly seven top-level tabs, but the features
 * behind them are far more numerous. Rather than drop features, each portal
 * declares seven domains and the remaining screens become sub-navigation
 * inside the active domain. The screen components are untouched: a sub-item
 * just sets the same tab id the flat menu used to set, so the existing
 * `activeTab === '...'` render blocks keep working.
 *
 * Expects the dark sidebar look shared by the super admin, academic admin,
 * accounts admin, discipline admin, teacher and parent portals.
 */

export const findGroupForTab = (groups, tabId) =>
  groups.find((g) => g.items.some((i) => i.id === tabId)) || null;

export const countItems = (groups) => groups.reduce((n, g) => n + g.items.length, 0);

const GroupedNav = ({
  groups,
  activeTab,
  onSelect,
  expanded = true,          // sidebar expanded, or mobile drawer open
  isMobile = false,
  onNavigate,               // called after a selection, e.g. to close the drawer
  accent = '#ffc107',
  activeBg = 'rgba(255,193,7,.15)',
  inactiveColor = 'rgba(255,255,255,.7)',
  groupGap = 8
}) => {
  const activeGroup = useMemo(() => findGroupForTab(groups, activeTab), [groups, activeTab]);
  const [openId, setOpenId] = useState(activeGroup ? activeGroup.id : null);

  // Keep the active domain open, including when the tab is changed from
  // elsewhere (e.g. the notification bell jumping to Messages).
  useEffect(() => {
    if (activeGroup) setOpenId(activeGroup.id);
  }, [activeGroup]);

  if (process.env.NODE_ENV === 'development' && groups.length !== 7) {
    // eslint-disable-next-line no-console
    console.warn(`Portal nav must expose exactly 7 tabs, received ${groups.length}.`);
  }

  const pick = (id) => {
    onSelect(id);
    if (onNavigate) onNavigate();
  };

  return (
    <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
      {groups.map((group) => {
        const isActiveGroup = activeGroup && activeGroup.id === group.id;
        const isOpen = openId === group.id;
        const single = group.items.length === 1;
        const badgeTotal = group.items.reduce((n, i) => n + (i.badge > 0 ? i.badge : 0), 0);

        // A one-screen domain has nothing to expand, so it navigates directly.
        const onGroupClick = () => {
          if (single) return pick(group.items[0].id);
          setOpenId(isOpen ? null : group.id);
        };

        return (
          <div key={group.id} style={{ marginBottom: groupGap }}>
            <button
              onClick={onGroupClick}
              aria-expanded={single ? undefined : isOpen}
              style={{
                display: 'flex', alignItems: 'center', gap: 11,
                width: '100%', padding: '10px 16px',
                background: isActiveGroup ? activeBg : 'transparent',
                border: 'none',
                borderRight: isActiveGroup ? `3px solid ${accent}` : '3px solid transparent',
                color: isActiveGroup ? accent : inactiveColor,
                cursor: 'pointer', fontSize: 13, fontWeight: isActiveGroup ? 600 : 400,
                transition: 'all .2s', textAlign: 'left'
              }}
            >
              <i className={group.icon} style={{ fontSize: 15, width: 18, flexShrink: 0 }} />
              {expanded && (
                <>
                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{group.label}</span>
                  {badgeTotal > 0 && (
                    <span style={{ background: '#e74c3c', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                      {badgeTotal}
                    </span>
                  )}
                  {!single && (
                    <i
                      className={`fas fa-chevron-${isOpen ? 'down' : 'right'}`}
                      style={{ fontSize: 10, flexShrink: 0 }}
                    />
                  )}
                </>
              )}
            </button>

            {!single && isOpen && expanded && (
              <div role="group" aria-label={group.label}>
                {group.items.map((item) => {
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => pick(item.id)}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '8px 16px 8px 34px',
                        background: active ? activeBg : 'transparent',
                        border: 'none',
                        borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
                        color: active ? accent : 'rgba(255,255,255,.55)',
                        cursor: 'pointer', fontSize: 12.5, fontWeight: active ? 600 : 400,
                        transition: 'all .2s', textAlign: 'left'
                      }}
                    >
                      {item.icon && <i className={item.icon} style={{ fontSize: 12, width: 15, flexShrink: 0 }} />}
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                      {item.badge > 0 && (
                        <span style={{ background: '#e74c3c', color: 'white', borderRadius: 20, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

export default GroupedNav;
