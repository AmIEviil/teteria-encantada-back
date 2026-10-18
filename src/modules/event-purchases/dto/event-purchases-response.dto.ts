import {
  EventPurchaseOrigin,
  EventPurchaseStatus,
} from '../../events/entities/event-purchase.entity';

export interface EventPurchaseRow {
  id: string;
  createdAt: string;
  buyerEmail: string;
  buyerDisplayName: string | null;
  eventId: string;
  eventTitle: string | null;
  ticketsCount: number;
  total: number;
  status: EventPurchaseStatus;
  origin: EventPurchaseOrigin;
  mpPaymentId: string | null;
  manualPaymentMethod: string | null;
}

export interface EventPurchasesListResponse {
  items: EventPurchaseRow[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  totals: {
    totalPurchases: number;
    paidPurchases: number;
    paidAmount: number;
  };
}

export interface EventPurchaseAttendee {
  firstName: string;
  lastName: string;
  ticketTypeName: string | null;
  attendanceDate: string | null;
  sessionId: string | null;
}

export interface EventPurchaseDetail extends EventPurchaseRow {
  mpPayerId: string | null;
  paidAt: string | null;
  mpPaymentMethod: string | null;
  attendees: EventPurchaseAttendee[];
  hasTicketsFile: boolean;
  hasReceiptFile: boolean;
  otherPurchases: EventPurchaseRow[];
}
