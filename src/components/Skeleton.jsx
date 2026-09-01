import React from 'react';

const pulse = 'animate-pulse bg-gray-200 rounded';

export function SkeletonCard() {
  return <div className={`${pulse} h-28 rounded-xl`} />;
}

export function SkeletonRow() {
  return <div className={`${pulse} h-10 rounded-lg`} />;
}

export function SkeletonChart() {
  return <div className={`${pulse} h-48 rounded-xl`} />;
}

export function SectionSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="animate-pulse bg-gray-200 rounded-lg h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonChart />
      <div className="space-y-2">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
