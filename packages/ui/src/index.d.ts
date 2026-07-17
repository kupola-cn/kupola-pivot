import type { PivotCapability, PivotCommand, PivotExecutionContext, PivotResult } from '@kupola/pivot-protocol';
import type { PolicyResult } from '@kupola/pivot-policy';

export interface TrustedUIConfirmInput {
  command: PivotCommand;
  capability: PivotCapability;
  policy: PolicyResult;
  context: PivotExecutionContext;
}

export interface TrustedUIAdapter {
  showMessage(message: string, options?: Record<string, unknown>): void;
  showResult(result: PivotResult): void;
  confirm(input: TrustedUIConfirmInput): boolean | Promise<boolean>;
  openAssistant(options?: Record<string, unknown>): void;
  closeAssistant(): void;
}

export function createTrustedUIAdapter(adapter?: Partial<TrustedUIAdapter>): TrustedUIAdapter;
