import React from 'react';
export default function Toggle({ checked, onChange, disabled = false, size = 'md' }) {
  const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6';
  const k = size === 'sm' ? 'w-3.5 h-3.5 top-[3px] left-[3px]' : 'w-4 h-4 top-1 left-1';
  const t = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  return (
    <button type="button" role="switch" aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex rounded-full transition-colors duration-200 focus:outline-none ${w} ${checked ? 'bg-blue-700' : 'bg-gray-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className={`absolute bg-white rounded-full shadow transition-transform duration-200 ${k} ${checked ? t : 'translate-x-0'}`} />
    </button>
  );
}
