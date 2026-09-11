'use client';

import Link from 'next/link';
import { ADMIN_NAV } from './nav';

export default function AdminSidebar({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="adm-sidebar" aria-label="Admin navigation">
      <div className="adm-sidebar-groups">
        {ADMIN_NAV.map((group) => (
          <div key={group.group} className="adm-nav-group">
            <div className="adm-nav-heading">{group.group}</div>
            <ul className="adm-nav-list">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.slug}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`adm-nav-item${active ? ' adm-nav-item-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="adm-nav-label">{item.title}</span>
                      {!item.implemented && <span className="adm-nav-planned" title="Not yet implemented">planned</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}