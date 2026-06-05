import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Download, CalendarDays, Calculator } from 'lucide-react';
import { cn } from './lib/utils';
import { AppState, getInitialMonthData, MEAL_PRICE, YEAR, MonthData, DailyData } from './types';

function getDaysInMonth(month: number) {
  return new Date(YEAR, month, 0).getDate();
}

function getDayOfWeek(month: number, day: number) {
  return new Date(YEAR, month - 1, day).getDay();
}

function getDayName(dayIndex: number) {
  const map = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return map[dayIndex];
}

export default function App() {
  const [activeMonth, setActiveMonth] = useState<number>(new Date().getMonth() + 1);
  const [appData, setAppData] = useState<AppState>(() => {
    const saved = localStorage.getItem('study_schedule_2026');
    if (saved) return JSON.parse(saved);
    const initial: AppState = {};
    for (let i = 1; i <= 12; i++) initial[i] = getInitialMonthData();
    return initial;
  });

  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('study_schedule_2026', JSON.stringify(appData));
  }, [appData]);

  const monthData = appData[activeMonth];
  const daysCount = getDaysInMonth(activeMonth);
  const daysArray = Array.from({ length: daysCount }, (_, i) => i + 1);

  const calculateTotals = () => {
    let oCount = 0;
    let xCount = 0;
    Object.values(monthData.days).forEach((d) => {
      if (d.status === 'o') oCount++;
      if (d.status === 'X') xCount++;
    });

    const mealTotal = oCount * MEAL_PRICE;
    const tuitionTotal = (oCount - monthData.prevBalance) * monthData.pricePerSession;
    const grandTotal =
      tuitionTotal +
      (Number(monthData.electricity) || 0) +
      (Number(monthData.boarding) || 0) +
      (Number(monthData.internet) || 0) +
      mealTotal +
      (Number(monthData.oldDebt) || 0);

    return { oCount, xCount, mealTotal, tuitionTotal, grandTotal };
  };

  const totals = calculateTotals();

  const handleUpdateDay = (day: number, data: Partial<DailyData>) => {
    setAppData((prev) => ({
      ...prev,
      [activeMonth]: {
        ...prev[activeMonth],
        days: {
          ...prev[activeMonth].days,
          [day]: {
            status: '',
            note: '',
            ...(prev[activeMonth].days[day] || {}),
            ...data,
          },
        },
      },
    }));
  };

  const toggleStatus = (day: number) => {
    const current = monthData.days[day]?.status || '';
    const nextMap: Record<string, 'o' | 'X' | ''> = {
      '': 'o',
      'o': 'X',
      'X': '',
    };
    handleUpdateDay(day, { status: nextMap[current] });
  };

  const handleUpdateFinance = (field: keyof MonthData, value: number) => {
    setAppData((prev) => {
      const nextData = { ...prev };
      nextData[activeMonth] = {
        ...nextData[activeMonth],
        [field]: value,
      };

      // Auto roll-over closingBalance to next month's prevBalance
      if (field === 'closingBalance' && activeMonth < 12) {
        nextData[activeMonth + 1] = {
          ...nextData[activeMonth + 1],
          prevBalance: value,
        };
      }

      return nextData;
    });
  };

  const exportPDF = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Bang_The_Doi_Hoc_Tap_T${activeMonth}_${YEAR}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-sans">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarDays className="text-blue-600" />
              Quản lý Lịch Học Cá Nhân năm {YEAR}
            </h1>
            <p className="text-gray-500 mt-1">Theo dõi chuyên cần, tự động tính toán học phí.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <select
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-medium shadow-sm transition-all outline-none"
              value={activeMonth}
              onChange={(e) => setActiveMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
              ))}
            </select>
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm cursor-pointer"
            >
              <Download size={18} />
              <span>Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div ref={exportRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          
          <div className="p-6 border-b border-gray-100 bg-white">
            <h2 className="text-xl font-bold text-gray-800">
              Bảng Theo Dõi Tháng {activeMonth} / {YEAR}
            </h2>
          </div>

          <div className="p-6 overflow-x-auto custom-scrollbar">
            {/* Spreadsheet Table */}
            <div className="inline-block min-w-full align-middle border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-28 px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb]">
                      Hàng \ Ngày
                    </th>
                    {daysArray.map((day) => {
                      const dow = getDayOfWeek(activeMonth, day);
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <th
                          key={day}
                          className={cn(
                            "w-14 px-1 py-3 text-center text-xs font-bold text-gray-500 uppercase border-r border-gray-200 last:border-r-0",
                            isWeekend ? "bg-gray-200/60" : ""
                          )}
                        >
                          {day}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  
                  {/* Row: Thứ */}
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb]">
                      Thứ
                    </td>
                    {daysArray.map((day) => {
                      const dow = getDayOfWeek(activeMonth, day);
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <td
                          key={day}
                          className={cn(
                            "px-1 py-2 text-center text-sm font-medium border-r border-gray-200 last:border-r-0",
                            isWeekend ? "bg-gray-100 text-gray-600" : "text-gray-900",
                            dow === 0 && "text-red-500 bg-red-50/50" // Highlighting Sunday slightly
                          )}
                        >
                          {getDayName(dow)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Trạng thái */}
                  <tr>
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb]">
                      Trạng thái
                    </td>
                    {daysArray.map((day) => {
                      const dow = getDayOfWeek(activeMonth, day);
                      const isWeekend = dow === 0 || dow === 6;
                      const status = monthData.days[day]?.status || '';
                      return (
                        <td
                          key={day}
                          onClick={() => toggleStatus(day)}
                          className={cn(
                            "px-1 py-1 text-center text-base font-bold cursor-pointer transition-colors border-r border-gray-200 last:border-r-0 select-none",
                            isWeekend && !status && "bg-gray-50",
                            status === 'o' && "bg-green-100 text-green-700",
                            status === 'X' && "bg-red-100 text-red-700",
                            !status && "hover:bg-blue-50"
                          )}
                        >
                          {status || '-'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Ghi chú */}
                  <tr>
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb]">
                      Ghi chú
                    </td>
                    {daysArray.map((day) => {
                      const dow = getDayOfWeek(activeMonth, day);
                      const isWeekend = dow === 0 || dow === 6;
                      const status = monthData.days[day]?.status || '';
                      
                      return (
                        <td
                          key={day}
                          className={cn(
                            "px-1 py-1 text-center border-r border-gray-200 last:border-r-0",
                            isWeekend && "bg-gray-50",
                            status === 'o' && "bg-green-50/30",
                            status === 'X' && "bg-red-50/30"
                          )}
                        >
                          <input
                            type="text"
                            value={monthData.days[day]?.note || ''}
                            onChange={(e) => handleUpdateDay(day, { note: e.target.value })}
                            className="w-full bg-transparent text-center text-xs text-gray-600 outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 min-w-[3rem]"
                            placeholder="..."
                          />
                        </td>
                      );
                    })}
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          {/* Calculations & Finances */}
          <div className="p-6 bg-slate-50/50 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left: Summary & Simple Inputs */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Calculator size={20} className="text-blue-600"/> Tổng kết chuyên cần
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <div className="text-green-800 text-sm font-medium mb-1">Số buổi học (o)</div>
                    <div className="text-3xl font-bold text-green-700">{totals.oCount}</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                    <div className="text-red-800 text-sm font-medium mb-1">Số buổi nghỉ (X)</div>
                    <div className="text-3xl font-bold text-red-700">{totals.xCount}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-gray-200 pb-3">
                  <span className="text-gray-700 font-medium whitespace-nowrap">Tồn tháng trước (buổi)</span>
                  <input
                    type="number"
                    value={monthData.prevBalance || 0}
                    onChange={(e) => handleUpdateFinance('prevBalance', Number(e.target.value))}
                    className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-gray-200 pb-3">
                  <span className="text-gray-700 font-medium whitespace-nowrap">Tồn chuyển sang tháng sau</span>
                  <input
                    type="number"
                    value={monthData.closingBalance || 0}
                    onChange={(e) => handleUpdateFinance('closingBalance', Number(e.target.value))}
                    className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-gray-200 pb-3">
                  <span className="text-gray-700 font-medium whitespace-nowrap">Số tiền 1 buổi (đ)</span>
                  <input
                    type="number"
                    value={monthData.pricePerSession || 0}
                    onChange={(e) => handleUpdateFinance('pricePerSession', Number(e.target.value))}
                    className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Right: Financial Breakdown */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Chi tiết chi phí</h3>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                
                <div className="flex justify-between items-center text-gray-900 font-bold text-lg border-b border-gray-100 pb-2">
                  <span>Thành tiền học <span className="text-xs text-gray-400 font-normal block sm:inline sm:ml-1">({totals.oCount} - {monthData.prevBalance}) x {monthData.pricePerSession.toLocaleString()}</span></span>
                  <span className="font-mono">{totals.tuitionTotal.toLocaleString()} đ</span>
                </div>

                <div className="flex justify-between items-center text-gray-700">
                  <span>Tiền ăn chính <span className="text-xs text-gray-400 block sm:inline sm:ml-1">({totals.oCount} x {MEAL_PRICE.toLocaleString()})</span></span>
                  <span className="font-mono font-medium">{totals.mealTotal.toLocaleString()} đ</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Tiền điện nước</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.electricity || ''}
                      onChange={(e) => handleUpdateFinance('electricity', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-500">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Hỗ trợ bán trú</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.boarding || ''}
                      onChange={(e) => handleUpdateFinance('boarding', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-500">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Tiền mạng</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.internet || ''}
                      onChange={(e) => handleUpdateFinance('internet', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-500">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                  <span className="text-gray-700">Tiền học tháng cũ</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.oldDebt || ''}
                      onChange={(e) => handleUpdateFinance('oldDebt', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-500">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xl font-bold text-gray-900 uppercase">Tổng cộng</span>
                  <span className="text-2xl font-bold text-blue-700 font-mono tracking-tight">{totals.grandTotal.toLocaleString()} đ</span>
                </div>

              </div>
            </div>

          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-400">
          Click vào ô Trạng thái để chuyển đổi giữa Học (o), Nghỉ (X) và Trống. 
          Các dữ liệu sẽ được tự động lưu lại trong trình duyệt.
        </div>
      </div>
    </div>
  );
}
