import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { COUNTRY_CODES } from '../lib/countries';
import { getCountryFlag } from '../lib/countryUtils';

interface PhoneInputProps {
  countryCode: string;
  phone: string;
  onCountryChange: (code: string) => void;
  onPhoneChange: (phone: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  countryCode,
  phone,
  onCountryChange,
  onPhoneChange,
  placeholder = 'Phone number',
  required = false,
  autoFocus = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Get current country info
  const currentCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  const filteredCountries = COUNTRY_CODES.filter(
    c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
         c.code.includes(searchTerm) ||
         c.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = useCallback((code: string) => {
    onCountryChange(code);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(0);
    // Focus phone input after selection
    setTimeout(() => phoneInputRef.current?.focus(), 0);
  }, [onCountryChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredCountries.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCountries[highlightedIndex]) {
          handleSelect(filteredCountries[highlightedIndex].code);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchTerm('');
        break;
    }
  }, [isOpen, filteredCountries, highlightedIndex, handleSelect]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 15) {
      onPhoneChange(val);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative flex items-stretch bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-productivity-500/50 focus-within:border-productivity-500 transition-all ${className}`}
    >
      {/* Country Code Selector */}
      <div className="relative" onKeyDown={handleKeyDown}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="h-full px-3 flex items-center gap-1.5 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 rounded-l-xl"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label="Select country code"
        >
          <span className="text-lg" role="img" aria-label={currentCountry.name}>
            {getCountryFlag(currentCountry.country)}
          </span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {currentCountry.code}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div 
            className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
            role="listbox"
          >
            {/* Search Input */}
            <div className="relative border-b border-slate-200 dark:border-slate-700">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search countries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-sm"
                aria-label="Search countries"
              />
            </div>
            
            {/* Country List */}
            <div className="max-h-56 overflow-y-auto">
              {filteredCountries.length === 0 ? (
                <div className="px-3 py-3 text-slate-500 dark:text-slate-400 text-sm text-center">
                  No countries found
                </div>
              ) : (
                filteredCountries.map((c, index) => (
                  <button
                    key={c.country}
                    ref={(el) => { itemRefs.current[index] = el; }}
                    type="button"
                    role="option"
                    aria-selected={c.code === countryCode}
                    onClick={() => handleSelect(c.code)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-colors ${
                      index === highlightedIndex 
                        ? 'bg-productivity-50 dark:bg-productivity-900/30' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    } ${c.code === countryCode ? 'bg-productivity-50 dark:bg-productivity-900/20' : ''}`}
                  >
                    <span className="text-lg" role="img" aria-hidden="true">
                      {getCountryFlag(c.country)}
                    </span>
                    <span className="flex-1 text-sm text-slate-900 dark:text-white truncate">
                      {c.name}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      {c.code}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phone Number Input */}
      <input
        ref={phoneInputRef}
        type="tel"
        inputMode="numeric"
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        value={phone}
        onChange={handlePhoneChange}
        placeholder={placeholder}
        className="flex-1 py-3 px-3 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-base disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Phone number"
      />
    </div>
  );
};

export default PhoneInput;
