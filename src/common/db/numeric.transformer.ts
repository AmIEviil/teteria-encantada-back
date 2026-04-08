import { ValueTransformer } from 'typeorm';

export const numericTransformer: ValueTransformer = {
  to(value: number | null | undefined): number | null | undefined {
    return value;
  },
  from(value: string | null): number | null {
    return value === null ? null : Number(value);
  },
};
