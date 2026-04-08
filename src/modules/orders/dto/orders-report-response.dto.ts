import { Order } from '../entities/order.entity';

export interface OrdersReportPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface OrdersMonthlySummaryItem {
  month: string;
  totalOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  totalSales: number;
  paidSales: number;
}

export interface OrdersReportTotals {
  totalOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  totalSales: number;
  paidSales: number;
}

export interface OrdersReportResponse {
  items: Order[];
  pagination: OrdersReportPagination;
  monthlySummary: OrdersMonthlySummaryItem[];
  totals: OrdersReportTotals;
}
