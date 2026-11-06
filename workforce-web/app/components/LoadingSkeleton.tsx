'use client';

import React from 'react';

export function CardSkeleton() {
  return (
    <div className="p-6 bg-white border border-slate-200/80 rounded-xl shadow-xs animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-slate-200 rounded w-1/3"></div>
        <div className="h-6 w-6 bg-slate-200 rounded-full"></div>
      </div>
      <div className="h-8 bg-slate-200 rounded w-1/2"></div>
      <div className="h-3 bg-slate-100 rounded w-3/4"></div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="animate-pulse border-b border-slate-100">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-4 px-4">
          <div className="h-4 bg-slate-200 rounded w-full"></div>
        </td>
      ))}
    </tr>
  );
}

export function RosterCardSkeleton() {
  return (
    <div className="p-4 bg-white border border-slate-200/80 rounded-xl shadow-xs animate-pulse flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200"></div>
        <div className="space-y-1.5">
          <div className="h-4 bg-slate-200 rounded w-32"></div>
          <div className="h-3 bg-slate-100 rounded w-20"></div>
        </div>
      </div>
      <div className="h-6 bg-slate-200 rounded-full w-16"></div>
    </div>
  );
}
