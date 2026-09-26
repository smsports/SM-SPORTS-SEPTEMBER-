import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
    value: string;
    label: string;
    badge?: string;
    className?: string;
}

interface InPlaceDropdownProps {
    value: string;
    options: (string | DropdownOption)[];
    onChange: (value: string) => void | Promise<void>;
    placeholder?: string;
    disabled?: boolean;
    isDark?: boolean;
    size?: 'xs' | 'sm' | 'md';
    className?: string;
    buttonClassName?: string;
    menuClassName?: string;
    fullWidth?: boolean;
    align?: 'left' | 'right';
}

export const InPlaceDropdown: React.FC<InPlaceDropdownProps> = ({
    value,
    options,
    onChange,
    placeholder = 'Select option...',
    disabled = false,
    isDark = true,
    size = 'sm',
    className = '',
    buttonClassName = '',
    menuClassName = '',
    fullWidth = false,
    align = 'left'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Normalize options
    const normalizedOptions: DropdownOption[] = options.map(opt => {
        if (typeof opt === 'string') {
            return { value: opt, label: opt };
        }
        return opt;
    });

    const selectedOption = normalizedOptions.find(opt => opt.value === value);
    const displayLabel = selectedOption ? selectedOption.label : (value || placeholder);

    // Close when clicking outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const handleSelect = (val: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        onChange(val);
        setIsOpen(false);
    };

    // Size styling configurations
    const sizeConfig = {
        xs: {
            btn: 'px-2 py-1 text-[9px] font-black',
            menu: 'text-[9px]',
            item: 'px-2.5 py-1.5',
            icon: 'w-2.5 h-2.5',
            badge: 'text-[8px] px-1 py-0.2'
        },
        sm: {
            btn: 'px-2.5 py-1.5 text-[10px] font-black',
            menu: 'text-[10px]',
            item: 'px-3 py-2',
            icon: 'w-3 h-3',
            badge: 'text-[8px] px-1.5 py-0.5'
        },
        md: {
            btn: 'px-4 py-2.5 text-xs font-black',
            menu: 'text-xs',
            item: 'px-3.5 py-2.5',
            icon: 'w-3.5 h-3.5',
            badge: 'text-[9px] px-2 py-0.5'
        }
    }[size];

    return (
        <div 
            ref={containerRef} 
            className={`relative ${fullWidth ? 'w-full' : 'inline-block'} ${className}`}
        >
            {/* The In-Place Dropdown Trigger */}
            <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!disabled) setIsOpen(prev => !prev);
                }}
                className={`flex items-center justify-between gap-1.5 rounded-lg border uppercase tracking-wider transition-all select-none outline-none ${
                    fullWidth ? 'w-full' : ''
                } ${sizeConfig.btn} ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${buttonClassName || (
                    isDark 
                        ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-white' 
                        : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'
                )} ${isOpen ? 'ring-2 ring-blue-500/30' : ''}`}
                aria-expanded={isOpen}
            >
                <span className="truncate max-w-[180px]">{displayLabel}</span>
                <ChevronDown className={`${sizeConfig.icon} shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* In-Place Dropdown Menu - rendered right there itself, NO popups */}
            {isOpen && (
                <div 
                    className={`absolute z-[9999] top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} min-w-[140px] max-w-[280px] max-h-60 overflow-y-auto rounded-xl border shadow-2xl backdrop-blur-md transition-all ${
                        isDark 
                            ? 'bg-zinc-900/95 border-zinc-700 text-zinc-200 shadow-black/80' 
                            : 'bg-white/95 border-gray-200 text-gray-800 shadow-xl'
                    } ${menuClassName}`}
                >
                    <div className="p-1 space-y-0.5">
                        {normalizedOptions.map((opt, idx) => {
                            const isSelected = opt.value === value;
                            return (
                                <button
                                    key={`in-place-opt-${opt.value}-${idx}`}
                                    type="button"
                                    onClick={(e) => handleSelect(opt.value, e)}
                                    className={`w-full flex items-center justify-between gap-2 rounded-lg text-left font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        sizeConfig.item
                                    } ${
                                        isSelected 
                                            ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white') 
                                            : (isDark ? 'hover:bg-zinc-800 hover:text-white text-zinc-300' : 'hover:bg-gray-100 hover:text-gray-900 text-gray-700')
                                    } ${opt.className || ''}`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {opt.badge && (
                                            <span className={`rounded font-mono font-bold ${sizeConfig.badge} ${
                                                isSelected 
                                                    ? 'bg-white/20 text-white' 
                                                    : (isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-600')
                                            }`}>
                                                {opt.badge}
                                            </span>
                                        )}
                                        {isSelected && (
                                            <Check className={`${sizeConfig.icon} shrink-0 text-white`} />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
export default InPlaceDropdown;
