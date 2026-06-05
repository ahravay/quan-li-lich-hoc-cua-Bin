export type DailyData = {
  status: 'o' | 'X' | '';
  note: string;
};

export type MonthData = {
  prevBalance: number;    // Tồn tháng trước (số buổi)
  closingBalance: number; // Tồn chuyển sang tháng sau
  pricePerSession: number;// Số tiền 1 buổi
  electricity: number;    // Tiền điện nước
  boarding: number;       // Hỗ trợ bán trú
  internet: number;       // Tiền mạng
  oldDebt: number;        // Tiền nợ/Tiền học tháng cũ
  days: Record<number, DailyData>;
};

export type AppState = Record<number, MonthData>;

export const getInitialMonthData = (): MonthData => ({
  prevBalance: 0,
  closingBalance: 0,
  pricePerSession: 120000,
  electricity: 0,
  boarding: 0,
  internet: 0,
  oldDebt: 0,
  days: {},
});

export const MEAL_PRICE = 25000; // 25.000đ/buổi
export const YEAR = 2026;
