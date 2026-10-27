import React from 'react';
import { ROUTE_METADATA } from '../data/seoData';

/**
 * Breadcrumbs Component - Accessible Industrial Navigation Path
 */
export default function Breadcrumbs({ activeTab, onNavigate, customCrumb = null }) {
  const meta = ROUTE_METADATA[activeTab] || ROUTE_METADATA.dashboard;
  const crumbs = customCrumb ? [...meta.breadcrumbs, customCrumb] : meta.breadcrumbs;

  return (
    <nav 
      aria-label="Breadcrumbs"
      className="bg-[#FFFFFF] border border-[#D8D8D5] px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs text-[#666666] flex items-center justify-between overflow-x-auto select-none"
    >
      <ol className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          const targetTab = crumb.path.replace(/^#\/?/, '') || 'dashboard';

          return (
            <li key={idx} className="flex items-center space-x-1.5 sm:space-x-2">
              {idx > 0 && <span className="text-[#B0B0AC]" aria-hidden="true">/</span>}
              {isLast ? (
                <span 
                  aria-current="page" 
                  className="font-bold text-[#222222] bg-[#F7F7F5] px-2 py-0.5 border border-[#D8D8D5]"
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(targetTab)}
                  className="hover:text-[#222222] hover:underline focus:outline-none transition-colors"
                >
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="hidden md:flex items-center gap-2 text-[10px] sm:text-[11px] text-[#666666] shrink-0 pl-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#3F7655]"></span>
        <span>Colliery: <strong>Moonidih P-4</strong></span>
        <span className="text-[#D8D8D5]">|</span>
        <span>DGMS Safe Grid</span>
      </div>
    </nav>
  );
}
