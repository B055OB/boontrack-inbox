'use client';

import React from 'react';
import { I18nContext, useTranslation } from './use-translation';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const i18n = useTranslation();
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}
