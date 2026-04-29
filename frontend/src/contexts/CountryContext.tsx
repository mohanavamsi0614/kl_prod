import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { COUNTRY_CODES } from '../lib/countries';

interface CountryContextType {
  detectedCountryCode: string;
  detectedCountryIso: string;
  isLoading: boolean;
  setCountryCode: (code: string) => void;
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'productivity_detected_country';

interface StoredCountry {
  code: string;
  iso: string;
  timestamp: number;
}

export const CountryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [detectedCountryCode, setDetectedCountryCode] = useState('+1');
  const [detectedCountryIso, setDetectedCountryIso] = useState('US');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectCountry = async () => {
      // Check sessionStorage first
      try {
        const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          const parsed: StoredCountry = JSON.parse(stored);
          // Use cached value if less than 1 hour old
          if (Date.now() - parsed.timestamp < 3600000) {
            setDetectedCountryCode(parsed.code);
            setDetectedCountryIso(parsed.iso);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Ignore parse errors
      }

      // Fetch from API
      try {
        const res = await fetch('/auth/detect-country');
        const data = await res.json();
        
        const callingCode = data.countryCode || '+1';
        const isoCode = data.countryIso || 'US';
        
        // Validate that the code exists in our list
        const detected = COUNTRY_CODES.find(c => c.code === callingCode);
        if (detected) {
          setDetectedCountryCode(detected.code);
          setDetectedCountryIso(detected.country);
          
          // Store in sessionStorage
          const toStore: StoredCountry = {
            code: detected.code,
            iso: detected.country,
            timestamp: Date.now()
          };
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toStore));
        } else {
          // Use the ISO code from API if country code not found in list
          setDetectedCountryCode(callingCode);
          setDetectedCountryIso(isoCode);
          
          // Store in sessionStorage
          const toStore: StoredCountry = {
            code: callingCode,
            iso: isoCode,
            timestamp: Date.now()
          };
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toStore));
        }
      } catch (e) {
        console.error('Failed to detect country:', e);
        // Keep default +1/US
      } finally {
        setIsLoading(false);
      }
    };

    detectCountry();
  }, []);

  const setCountryCode = (code: string) => {
    const country = COUNTRY_CODES.find(c => c.code === code);
    if (country) {
      setDetectedCountryCode(country.code);
      setDetectedCountryIso(country.country);
      
      // Update sessionStorage
      const toStore: StoredCountry = {
        code: country.code,
        iso: country.country,
        timestamp: Date.now()
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toStore));
    }
  };

  return (
    <CountryContext.Provider value={{ 
      detectedCountryCode, 
      detectedCountryIso, 
      isLoading,
      setCountryCode 
    }}>
      {children}
    </CountryContext.Provider>
  );
};

export const useCountry = (): CountryContextType => {
  const context = useContext(CountryContext);
  if (!context) {
    throw new Error('useCountry must be used within a CountryProvider');
  }
  return context;
};
