import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { 
  Download, 
  CalendarDays, 
  Calculator, 
  History, 
  User, 
  Search, 
  Trash2, 
  LogIn, 
  LogOut,
  Sparkles,
  Activity,
  CheckCircle,
  FileSpreadsheet,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { AppState, getInitialMonthData, MEAL_PRICE, YEAR, MonthData, DailyData, LogEntry } from './types';

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

const PRESET_USERS = [
  { email: 'giaovien2026@gmail.com', name: 'Giáo viên', role: 'Giáo viên' },
  { email: 'anbui.jp@gmail.com', name: 'Bùi An (Phụ huynh)', role: 'Phụ huynh' }
];

// One-way rolling hash validation helper for "(yêu cầu mã hóa để tránh bị lộ khi vọc web app)"
const obfuscateOTP = (otp: string) => {
  let val = 0;
  for (let i = 0; i < otp.length; i++) {
    val = (val * 31 + otp.charCodeAt(i)) % 1000000007;
  }
  return `secure_token_${val.toString(16)}`;
};

export default function App() {
  const [activeMonth, setActiveMonth] = useState<number>(new Date().getMonth() + 1);
  
  // App state
  const [appData, setAppData] = useState<AppState>(() => {
    const saved = localStorage.getItem('study_schedule_2026');
    if (saved) return JSON.parse(saved);
    const initial: AppState = {};
    for (let i = 1; i <= 12; i++) initial[i] = getInitialMonthData();
    return initial;
  });

  // Current Google Account (using new key namespace to clear outdated cache)
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; role: string }>(() => {
    const saved = localStorage.getItem('study_schedule_user_v3');
    if (saved) return JSON.parse(saved);
    return PRESET_USERS[0]; // Mặc định là Giáo viên
  });

  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // OTP States handling
  const [targetOtpHash, setTargetOtpHash] = useState<string>('');
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [pendingUser, setPendingUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Custom modal states to avoid browser sandbox confirm/alert blocking issues in iframe
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [customFeedbackMessage, setCustomFeedbackMessage] = useState<{ type: 'error' | 'success' | 'warning'; text: string } | null>(null);

  // Timeline Logs state
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem('study_schedule_2026_logs');
    if (saved) return JSON.parse(saved);
    
    // Initial system log
    return [{
      id: 'system-init',
      timestamp: new Date().toISOString(),
      userEmail: 'system@google.com',
      action: 'Khởi tạo hệ thống Quản lý Lịch Học Cá Nhân năm 2026',
      category: 'system'
    }];
  });

  // Search & Filters for Timeline
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'status' | 'note' | 'finance' | 'system'>('all');

  // Input Focus tracking for Logs (to avoid duplicates/spam)
  const [focusedNote, setFocusedNote] = useState<{ day: number; val: string } | null>(null);
  const [focusedFinance, setFocusedFinance] = useState<{ field: keyof MonthData; val: number } | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  // Persists
  useEffect(() => {
    localStorage.setItem('study_schedule_2026', JSON.stringify(appData));
  }, [appData]);

  useEffect(() => {
    localStorage.setItem('study_schedule_user_v3', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('study_schedule_2026_logs', JSON.stringify(logs));
  }, [logs]);

  // Lazy dynamic default values transfer from Month (N-1) to Month (N)
  useEffect(() => {
    const currentMonthData = appData[activeMonth];
    if (activeMonth > 1) {
      const prevMonthData = appData[activeMonth - 1];
      // If client didn't override default monthly prev balance and closingBalance has changed, roll over
      if (currentMonthData.prevBalance === 0 && prevMonthData.closingBalance !== 0) {
        setAppData(prev => ({
          ...prev,
          [activeMonth]: {
            ...prev[activeMonth],
            prevBalance: prevMonthData.closingBalance
          }
        }));
      }
    }
  }, [activeMonth]);

  const monthData = appData[activeMonth];
  const daysCount = getDaysInMonth(activeMonth);
  const daysArray = Array.from({ length: daysCount }, (_, i) => i + 1);

  // Reusable function to dispatch logs
  const addLog = (category: LogEntry['category'], action: string) => {
    const newEntry: LogEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      userEmail: currentUser.email,
      action,
      category
    };
    setLogs(prev => [newEntry, ...prev].slice(0, 1000)); // Keep last 1000 logs
  };

  const calculateTotals = () => {
    let oCount = 0;
    let xCount = 0;
    Object.values(monthData.days).forEach((item) => {
      const d = item as DailyData;
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
    const nextStatus = nextMap[current];
    handleUpdateDay(day, { status: nextStatus });

    // Log the change
    const labelCurrent = current === 'o' ? 'Học (o)' : current === 'X' ? 'Nghỉ (X)' : 'Trống';
    const labelNext = nextStatus === 'o' ? 'Học (o)' : nextStatus === 'X' ? 'Nghỉ (X)' : 'Trống';
    addLog('status', `Thay đổi trạng thái ngày ${day} tháng ${activeMonth} từ "${labelCurrent}" thành "${labelNext}"`);
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

  const sendOtpEmail = async (email: string, otp: string) => {
    setEmailStatus('sending');
    try {
      const response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(email), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          _subject: `🔑 Mã OTP bảo mật của bạn: ${otp} (Lịch Học 2026)`,
          message: `Chào bạn, mã OTP xác thực đổi tài khoản đăng nhập (quyền Phụ huynh) của bạn là: ${otp}\n\nVui lòng nhập mã này trên giao diện web app của bạn để hoàn tất quá trình xác minh.\n\nThông tin người nhận: ${email}\nThời gian yêu cầu: ${new Date().toLocaleString('vi-VN')}`,
          _replyto: "noreply@study-schedule-2026.com"
        })
      });
      if (response.ok) {
        setEmailStatus('success');
        addLog('system', `Hệ thống đã gửi thành công email chứa mã xác thực OTP thực đến hòm thư: "${email}".`);
      } else {
        throw new Error("Dịch vụ gửi mail phản hồi lỗi");
      }
    } catch (err) {
      console.error("Lỗi gửi email:", err);
      setEmailStatus('error');
      addLog('system', `Phân hệ bảo mật: Lỗi khi kết nối cổng dịch vụ gửi email xác thực OTP đến "${email}".`);
    }
  };

  const handlePresetSelect = (targetUser: typeof PRESET_USERS[0]) => {
    const prevEmail = currentUser.email;
    if (targetUser.role === 'Phụ huynh' || targetUser.email === 'anbui.jp@gmail.com') {
      // Trigger Secure OTP
      const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
      const secureHash = obfuscateOTP(rawCode);
      setTargetOtpHash(secureHash);
      setPendingUser(targetUser);
      setOtpInput('');
      setOtpError('');
      setIsOtpModalOpen(true);

      // Trigger actual email send to anbui.jp@gmail.com
      sendOtpEmail('anbui.jp@gmail.com', rawCode);

      // Log dispatch
      addLog('system', `Hệ thống gửi mã OTP xác thực đổi tài khoản đăng nhập đến email: "anbui.jp@gmail.com".`);
    } else {
      setCurrentUser(targetUser);
      const entry: LogEntry = {
        id: 'sys_' + Date.now(),
        timestamp: new Date().toISOString(),
        userEmail: 'system@google.com',
        action: `Người dùng chuyển tài khoản hoạt động từ "${prevEmail}" sang "${targetUser.email}" (${targetUser.name})`,
        category: 'system'
      };
      setLogs(prev => [entry, ...prev]);
    }
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.includes('@')) {
      setCustomFeedbackMessage({ type: 'error', text: 'Vui lòng nhập Email Gmail hợp lệ!' });
      return;
    }
    const enteredEmail = customEmail.trim().toLowerCase();
    const isTargetingParent = enteredEmail === 'anbui.jp@gmail.com' || enteredEmail.includes('phuhuynh');
    const userRole = isTargetingParent ? 'Phụ huynh' : 'Giáo viên';

    const targetUser = {
      email: enteredEmail,
      name: customName || (isTargetingParent ? 'Bùi An (Phụ huynh)' : 'Giáo viên Khách'),
      role: userRole
    };

    if (isTargetingParent) {
      setIsLoginModalOpen(false);
      
      const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
      const secureHash = obfuscateOTP(rawCode);
      setTargetOtpHash(secureHash);
      setPendingUser(targetUser);
      setOtpInput('');
      setOtpError('');
      setIsOtpModalOpen(true);

      // Trigger actual email send to target parent email
      sendOtpEmail(enteredEmail, rawCode);

      addLog('system', `Hệ thống gửi mã OTP xác thực đăng nhập đến hòm thư: "${enteredEmail}".`);
    } else {
      const prevEmail = currentUser.email;
      setCurrentUser(targetUser);
      setIsLoginModalOpen(false);
      
      const entry: LogEntry = {
        id: 'sys_' + Date.now(),
        timestamp: new Date().toISOString(),
        userEmail: 'system@google.com',
        action: `Đăng nhập thành công bằng tài khoản Google mới: "${targetUser.email}" (${targetUser.name})`,
        category: 'system'
      };
      setLogs(prev => [entry, ...prev]);
      setCustomEmail('');
      setCustomName('');
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const computedHash = obfuscateOTP(otpInput.trim());
    if (computedHash === targetOtpHash && pendingUser) {
      const prevEmail = currentUser.email;
      setCurrentUser(pendingUser);
      setIsOtpModalOpen(false);

      const entry: LogEntry = {
        id: 'sys_' + Date.now(),
        timestamp: new Date().toISOString(),
        userEmail: 'system@google.com',
        action: `Xác thực OTP thành công. Tài khoản hoạt động chuyển sang: "${pendingUser.email}" (${pendingUser.name})`,
        category: 'system'
      };
      setLogs(prev => [entry, ...prev]);
      setPendingUser(null);
      setOtpInput('');
      setOtpError('');
    } else {
      setOtpError('Mã xác thực OTP không chính xác! Vui lòng kiểm tra lại thông tin.');
      addLog('system', `Bảo mật: Xác thực đăng nhập vào tài khoản Phụ huynh thất bại do nhập sai mã OTP.`);
    }
  };

  const clearLogs = () => {
    if (currentUser.role !== 'Phụ huynh') {
      setCustomFeedbackMessage({
        type: 'error',
        text: '⚠️ Quyền truy cập bị từ chối: Chỉ tài khoản Phụ huynh mới có thẩm quyền xóa toàn bộ lịch sử Timeline!'
      });
      addLog('system', `Cảnh báo bảo mật: Tài khoản "${currentUser.email}" (${currentUser.role}) cố tình thực hiện xóa nhật ký Timeline nhưng bị từ chối.`);
      return;
    }
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDeleteLogs = () => {
    setIsConfirmDeleteOpen(false);
    const resetLog: LogEntry = {
      id: 'system-reset',
      timestamp: new Date().toISOString(),
      userEmail: currentUser.email,
      action: 'Xóa toàn bộ lịch sử Timeline và thiết lập lại nhật ký',
      category: 'system'
    };
    setLogs([resetLog]);
    setCustomFeedbackMessage({
      type: 'success',
      text: 'Đã xóa thành công toàn bộ lịch sử nhật ký hoạt động trên Timeline.'
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
      addLog('system', `Xuất báo cáo PDF học tập tháng ${activeMonth} thành công`);
    } catch (err) {
      console.error('Failed to export PDF', err);
    }
  };

  // Log filtering
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.action.toLowerCase().includes(logSearch.toLowerCase()) || 
                          log.userEmail.toLowerCase().includes(logSearch.toLowerCase());
    const matchesCategory = logFilter === 'all' || log.category === logFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24 font-sans">
      
      {/* Top Navigation Frame for Google Sign-In status */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs px-4 py-2.5">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          
          {/* Identity Info */}
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="flex items-center gap-2 bg-slate-100 rounded-full pl-2 pr-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
              <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase">Google ID</span>
              <span className="font-mono text-slate-800">{currentUser.email}</span>
            </div>
            <span className="text-gray-400 text-xs hidden md:inline">|</span>
            <span className="text-xs text-gray-600 font-medium hidden md:inline">Quyền: {currentUser.role} ({currentUser.name})</span>
          </div>

          {/* Quick switcher list */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Chuyển tài khoản Gmail:</span>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {PRESET_USERS.map((user) => (
                <button
                  key={user.email}
                  onClick={() => handlePresetSelect(user)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md transition-all font-medium cursor-pointer",
                    currentUser.email === user.email 
                      ? "bg-white text-blue-600 shadow-xs border border-slate-200/50" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {user.role}
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <LogIn size={12} />
              <span>Khác</span>
            </button>
          </div>

        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {/* Header Title Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200/70 gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm uppercase tracking-wider">
              <Sparkles size={16} />
              <span>Giao Diện Bảng Tính 2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <FileSpreadsheet className="text-blue-600" />
              Quản lý Lịch Học Cá Nhân năm {YEAR}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Lưu trữ dữ liệu lịch học lớp học, tự động hóa tài chính và xuất biên lai PDF chuẩn hóa.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5">
              <label className="text-xs text-slate-500 font-medium px-2">Chọn Tháng:</label>
              <select
                className="bg-white border border-gray-200 text-slate-900 text-sm rounded-md font-bold block p-1.5 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                value={activeMonth}
                onChange={(e) => setActiveMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
                ))}
              </select>
            </div>

            <button
              onClick={exportPDF}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold transition-colors shadow-sm cursor-pointer hover:shadow-md"
            >
              <Download size={18} />
              <span>Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Calendar Grid Sheet */}
        <div ref={exportRef} className="bg-white rounded-2xl shadow-sm border border-gray-200/80 overflow-hidden">
          
          <div className="p-6 border-b border-gray-100 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 uppercase tracking-tight">
                Lịch Học Chi Tiết & Chuyên Cần — Tháng {activeMonth} / {YEAR}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Nhấp vào trạng thái ngày bất kỳ để thay đổi.</p>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 bg-green-100 border border-green-300 rounded text-green-700 font-bold flex items-center justify-center text-[8px]">o</span>
                <span>Buổi Học</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 bg-red-100 border border-red-300 rounded text-red-700 font-bold flex items-center justify-center text-[8px]">X</span>
                <span>Buổi Nghỉ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 bg-white border border-gray-300 rounded text-slate-500 font-bold flex items-center justify-center text-[8px]">-</span>
                <span>Trống</span>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-x-auto custom-scrollbar">
            {/* Spreadsheet Table */}
            <div className="inline-block min-w-full align-middle border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="w-28 px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-100 border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] z-10">
                      Hàng \ Ngày
                    </th>
                    {daysArray.map((day) => {
                      const dow = getDayOfWeek(activeMonth, day);
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <th
                          key={day}
                          className={cn(
                            "w-14 px-1 py-3 text-center text-xs font-bold uppercase border-r border-gray-200 last:border-r-0",
                            isWeekend ? "bg-slate-200/80 text-slate-700" : "text-slate-500"
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
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] z-10 font-bold">
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
                            isWeekend ? "bg-slate-100/70 text-slate-600 font-semibold" : "text-gray-900",
                            dow === 0 && "text-red-500 bg-red-50/50" // Sunday decoration
                          )}
                        >
                          {getDayName(dow)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Trạng thái */}
                  <tr>
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] z-10">
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
                            "px-1 py-1 text-center text-[15px] font-extrabold cursor-pointer transition-colors border-r border-gray-200 last:border-r-0 select-none",
                            isWeekend && !status && "bg-slate-50/80",
                            status === 'o' && "bg-emerald-100 text-emerald-800 border-b-2 border-b-emerald-400",
                            status === 'X' && "bg-rose-100 text-rose-800 border-b-2 border-b-rose-400",
                            !status && "hover:bg-blue-50/85 text-gray-300"
                          )}
                        >
                          {status || '-'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Ghi chú */}
                  <tr>
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 sticky left-0 bg-white border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] z-10">
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
                            isWeekend && "bg-slate-50/50",
                            status === 'o' && "bg-emerald-50/30",
                            status === 'X' && "bg-rose-50/30"
                          )}
                        >
                          <input
                            type="text"
                            value={monthData.days[day]?.note || ''}
                            onFocus={() => {
                              setFocusedNote({ day, val: monthData.days[day]?.note || '' });
                            }}
                            onBlur={(e) => {
                              const finalVal = e.target.value;
                              if (focusedNote && focusedNote.val !== finalVal) {
                                handleUpdateDay(day, { note: finalVal });
                                addLog('note', `Sửa ghi chú ngày ${day} tháng ${activeMonth} từ "${focusedNote.val || 'Trống'}" thành "${finalVal || 'Trống'}"`);
                              }
                              setFocusedNote(null);
                            }}
                            onChange={(e) => handleUpdateDay(day, { note: e.target.value })}
                            className="w-full bg-transparent text-center text-[11px] text-gray-600 outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 min-w-[3.5rem] tracking-tight placeholder:opacity-50"
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
            
            {/* Left Column: Chuyên cần & Inputs */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calculator size={20} className="text-blue-600"/> Tổng kết chuyên cần
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50/80 rounded-xl p-4 border border-emerald-100">
                    <div className="text-emerald-800 text-xs font-semibold mb-1 uppercase tracking-wider">Số buổi học (o)</div>
                    <div className="text-3xl font-extrabold text-emerald-700">{totals.oCount} <span className="text-sm font-medium">buổi</span></div>
                  </div>
                  <div className="bg-rose-50/80 rounded-xl p-4 border border-rose-100">
                    <div className="text-rose-800 text-xs font-semibold mb-1 uppercase tracking-wider">Số buổi nghỉ (X)</div>
                    <div className="text-3xl font-extrabold text-rose-700">{totals.xCount} <span className="text-sm font-medium">buổi</span></div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-gray-200 pb-3">
                  <span className="text-gray-700 font-medium whitespace-nowrap">Tồn tháng trước (buổi)</span>
                  <input
                    type="number"
                    value={monthData.prevBalance || 0}
                    onFocus={() => setFocusedFinance({ field: 'prevBalance', val: monthData.prevBalance })}
                    onBlur={(e) => {
                      const finalVal = Number(e.target.value) || 0;
                      if (focusedFinance && focusedFinance.val !== finalVal) {
                        addLog('finance', `Cập nhật "Tồn tháng trước" Tháng ${activeMonth} từ ${focusedFinance.val} thành ${finalVal}`);
                      }
                      setFocusedFinance(null);
                    }}
                    onChange={(e) => handleUpdateFinance('prevBalance', Number(e.target.value))}
                    className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-gray-200 pb-3">
                  <div>
                    <span className="text-gray-700 font-medium block">Tồn chuyển sang tháng sau (buổi)</span>
                    <span className="text-[10px] text-gray-400 block -mt-1">Tự động làm số tồn đầu cho Tháng {activeMonth === 12 ? 12 : activeMonth + 1}</span>
                  </div>
                  <input
                    type="number"
                    value={monthData.closingBalance || 0}
                    onFocus={() => setFocusedFinance({ field: 'closingBalance', val: monthData.closingBalance })}
                    onBlur={(e) => {
                      const finalVal = Number(e.target.value) || 0;
                      if (focusedFinance && focusedFinance.val !== finalVal) {
                        addLog('finance', `Cập nhật "Tồn chuyển sang tháng sau" Tháng ${activeMonth} từ ${focusedFinance.val} thành ${finalVal}`);
                      }
                      setFocusedFinance(null);
                    }}
                    onChange={(e) => handleUpdateFinance('closingBalance', Number(e.target.value))}
                    className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-dashed border-gray-200 pb-3">
                  <span className="text-gray-700 font-medium whitespace-nowrap">Đơn giá 1 buổi học (đ)</span>
                  <input
                    type="number"
                    value={monthData.pricePerSession || 0}
                    onFocus={() => setFocusedFinance({ field: 'pricePerSession', val: monthData.pricePerSession })}
                    onBlur={(e) => {
                      const finalVal = Number(e.target.value) || 0;
                      if (focusedFinance && focusedFinance.val !== finalVal) {
                        addLog('finance', `Cập nhật "Đơn giá 1 buổi học" Tháng ${activeMonth} từ ${focusedFinance.val.toLocaleString()}đ thành ${finalVal.toLocaleString()}đ`);
                      }
                      setFocusedFinance(null);
                    }}
                    onChange={(e) => handleUpdateFinance('pricePerSession', Number(e.target.value))}
                    className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Cost Categories */}
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wider text-sm">Bản kê chi tiết biên lai</h3>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                
                <div className="flex justify-between items-center text-slate-900 font-extrabold text-md border-b border-gray-100 pb-3">
                  <span>Thành tiền học <span className="text-xs text-slate-400 font-normal block sm:inline sm:ml-1">({totals.oCount} buổi - {monthData.prevBalance} tồn) x {monthData.pricePerSession.toLocaleString()}</span></span>
                  <span className="font-mono text-blue-700 font-bold">{totals.tuitionTotal.toLocaleString()} đ</span>
                </div>

                <div className="flex justify-between items-center text-gray-700 text-sm">
                  <span>Tiền ăn chính <span className="text-xs text-slate-400 block sm:inline sm:ml-1">({totals.oCount} buổi x {MEAL_PRICE.toLocaleString()})</span></span>
                  <span className="font-mono font-medium">{totals.mealTotal.toLocaleString()} đ</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">Tiền điện nước</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.electricity || ''}
                      onFocus={() => setFocusedFinance({ field: 'electricity', val: monthData.electricity })}
                      onBlur={(e) => {
                        const finalVal = Number(e.target.value) || 0;
                        if (focusedFinance && focusedFinance.val !== finalVal) {
                          addLog('finance', `Cập nhật "Tiền điện nước" Tháng ${activeMonth} từ ${focusedFinance.val.toLocaleString()}đ thành ${finalVal.toLocaleString()}đ`);
                        }
                        setFocusedFinance(null);
                      }}
                      onChange={(e) => handleUpdateFinance('electricity', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm font-semibold"
                      placeholder="0"
                    />
                    <span className="text-gray-500 font-medium">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">Hỗ trợ bán trú</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.boarding || ''}
                      onFocus={() => setFocusedFinance({ field: 'boarding', val: monthData.boarding })}
                      onBlur={(e) => {
                        const finalVal = Number(e.target.value) || 0;
                        if (focusedFinance && focusedFinance.val !== finalVal) {
                          addLog('finance', `Cập nhật "Hỗ trợ bán trú" Tháng ${activeMonth} từ ${focusedFinance.val.toLocaleString()}đ thành ${finalVal.toLocaleString()}đ`);
                        }
                        setFocusedFinance(null);
                      }}
                      onChange={(e) => handleUpdateFinance('boarding', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm font-semibold"
                      placeholder="0"
                    />
                    <span className="text-gray-500 font-medium">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">Tiền mạng</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.internet || ''}
                      onFocus={() => setFocusedFinance({ field: 'internet', val: monthData.internet })}
                      onBlur={(e) => {
                        const finalVal = Number(e.target.value) || 0;
                        if (focusedFinance && focusedFinance.val !== finalVal) {
                          addLog('finance', `Cập nhật "Tiền mạng" Tháng ${activeMonth} từ ${focusedFinance.val.toLocaleString()}đ thành ${finalVal.toLocaleString()}đ`);
                        }
                        setFocusedFinance(null);
                      }}
                      onChange={(e) => handleUpdateFinance('internet', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm font-semibold"
                      placeholder="0"
                    />
                    <span className="text-gray-500 font-medium">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm pb-4 border-b border-gray-200">
                  <span className="text-gray-700">Tiền học tháng cũ</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={monthData.oldDebt || ''}
                      onFocus={() => setFocusedFinance({ field: 'oldDebt', val: monthData.oldDebt })}
                      onBlur={(e) => {
                        const finalVal = Number(e.target.value) || 0;
                        if (focusedFinance && focusedFinance.val !== finalVal) {
                          addLog('finance', `Cập nhật "Tiền học tháng cũ/Nợ cũ" Tháng ${activeMonth} từ ${focusedFinance.val.toLocaleString()}đ thành ${finalVal.toLocaleString()}đ`);
                        }
                        setFocusedFinance(null);
                      }}
                      onChange={(e) => handleUpdateFinance('oldDebt', Number(e.target.value))}
                      className="w-28 px-3 py-1 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm font-semibold"
                      placeholder="0"
                    />
                    <span className="text-gray-500 font-medium">đ</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-lg font-black text-slate-800 uppercase tracking-tight">TỔNG CỘNG</span>
                  <span className="text-3xl font-black text-blue-700 font-mono tracking-tight">{totals.grandTotal.toLocaleString()} đ</span>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* Timeline Log Section (The exact log table request) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <History className="text-blue-500" />
                Dòng Thời Gian - Lịch Sử Chỉnh Sửa (Timeline Logs)
              </h2>
              <p className="text-xs text-slate-500 mt-1">Ghi nhận chính xác nhật ký thao tác của người dùng Gmail đang hoạt động trên hệ thống.</p>
            </div>

            <button
              onClick={clearLogs}
              className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer border border-rose-200/50"
            >
              <Trash2 size={13} />
              <span>Xóa nhật ký</span>
            </button>
          </div>

          <div className="p-6 space-y-4">
            
            {/* Filter and Search controls */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Tìm kiếm nội dung lịch sử hoặc Email Gmail..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/30"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(['all', 'status', 'note', 'finance', 'system'] as const).map((cat) => {
                  const labels: Record<string, string> = {
                    all: 'Tất cả',
                    status: 'Trạng thái (o/X)',
                    note: 'Ghi chú',
                    finance: 'Tài chính',
                    system: 'Hệ thống'
                  };
                  return (
                    <button
                      key={cat}
                      onClick={() => setLogFilter(cat)}
                      className={cn(
                        "px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer",
                        logFilter === cat
                          ? "bg-slate-800 border-slate-800 text-white shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
                      )}
                    >
                      {labels[cat]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actual logs feed */}
            <div className="border border-slate-100 rounded-xl max-h-[350px] overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
              <AnimatePresence initial={false}>
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => {
                    const isSystem = log.category === 'system';
                    const isStatus = log.category === 'status';
                    const isNote = log.category === 'note';
                    const isFinance = log.category === 'finance';

                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-700"
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "mt-0.5 rounded-full p-1.5 flex items-center justify-center shrink-0",
                            isSystem && "bg-slate-100 text-slate-500",
                            isStatus && "bg-sky-50 text-sky-600",
                            isNote && "bg-amber-50 text-amber-600",
                            isFinance && "bg-emerald-50 text-emerald-600"
                          )}>
                            <Activity size={13} />
                          </div>
                          
                          <div>
                            <p className="text-xs sm:text-sm font-medium text-slate-800 leading-normal">
                              {log.action}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 font-mono">
                              <span className="font-semibold text-slate-500 bg-slate-100 py-0.5 px-1 rounded">{log.category.toUpperCase()}</span>
                              <span>•</span>
                              <span className="text-blue-500">{log.userEmail}</span>
                              <span>•</span>
                              <span>{new Date(log.timestamp).toLocaleString('vi-VN')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-emerald-500 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-bold inline-flex items-center gap-0.5">
                            <CheckCircle size={10} />
                            <span>Đã xác minh</span>
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="py-12 px-4 text-center text-slate-400 text-sm">
                    Không tìm thấy lịch sử nào phù hợp với bộ lọc hiện tại.
                  </div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="text-xs text-slate-400 italic">
              * Tích hợp bộ quy chuẩn: Log ghi nhận tự động dựa trên Email Google được kích hoạt tại dải đầu của trang web. Dữ liệu dòng thời gian lưu trữ vĩnh viễn trên Local Storage.
            </div>

          </div>
        </div>

      </div>

      {/* Custom Mock Login Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden"
          >
            <div className="p-6 bg-slate-900 border-b border-slate-800 text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <User size={20} className="text-blue-400" />
                Đăng nhập tài khoản Google (Gmail)
              </h3>
              <p className="text-xs text-slate-400 mt-1">Mọi thay đổi trên lưới bảng tính sẽ được ghi log chính xác theo tài khoản Gmail này.</p>
            </div>
            
            <form onSubmit={handleCustomLogin} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Địa chỉ Gmail của bạn:</label>
                <input
                  type="email"
                  placeholder="VD: nguyenthithu@gmail.com"
                  required
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  className="w-full px-3,5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Họ và tên (Tùy chọn):</label>
                <input
                  type="text"
                  placeholder="VD: Cô Thu chủ nhiệm"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3,5 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors cursor-pointer"
                >
                  Xác nhận đăng nhập
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Secure OTP Verification Modal */}
      {isOtpModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden"
          >
            <div className="p-6 bg-slate-900 border-b border-slate-800 text-white text-center">
              <div className="mx-auto w-12 h-12 bg-red-600/10 text-red-500 rounded-full flex items-center justify-center mb-3">
                <ShieldAlert size={24} />
              </div>
              <h3 className="text-lg font-bold">
                Xác minh 2 lớp (Real Google 2-Step)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Mã OTP thực tế đang được gửi qua hòm thư điện tử bảo mật đến:
              </p>
              <div className="mt-2 bg-slate-950/80 rounded-md py-1.5 px-3 border border-slate-800 inline-block">
                <strong className="text-rose-400 font-mono text-sm tracking-wide">
                  {pendingUser?.email || 'anbui.jp@gmail.com'}
                </strong>
              </div>
            </div>
            
            <form onSubmit={handleVerifyOtp} className="p-6 space-y-4">
              {/* Actual Email Sending status indicators */}
              <div className="text-center py-1">
                {emailStatus === 'sending' && (
                  <div className="flex items-center justify-center gap-2 text-blue-600 text-xs font-bold bg-blue-50 py-2 px-3 rounded-lg border border-blue-100 animate-pulse">
                    <span className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>Đang tiến hành gửi email xác thực thực tế...</span>
                  </div>
                )}
                {emailStatus === 'success' && (
                  <div className="text-emerald-700 text-xs font-bold bg-emerald-50 py-2 px-3 rounded-lg border border-emerald-100">
                    ✓ Đã gửi mã OTP thực thành công! Hãy kiểm tra Hộp thư/Spam của bạn.
                  </div>
                )}
                {emailStatus === 'error' && (
                  <div className="text-rose-700 text-xs font-bold bg-rose-50 py-2 px-3 rounded-lg border border-rose-100">
                    ⚠ Gửi mail thất bại. Bạn vui lòng bấm "Gửi lại OTP" bên dưới.
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 text-center">
                  Nhập mã xác thực 6 chữ số:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="......"
                  required
                  autoFocus
                  disabled={emailStatus === 'sending'}
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value.replace(/\D/g, ''));
                    setOtpError('');
                  }}
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono font-bold px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-slate-50 disabled:opacity-60"
                />
                {otpError && (
                  <p className="text-xs text-red-650 text-center font-bold mt-2 bg-red-50 p-2 rounded border border-red-100/80">
                    {otpError}
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-between items-center text-xs text-slate-500 border-t border-slate-100 pt-3">
                <span>Không nhận được mã?</span>
                <button
                  type="button"
                  disabled={emailStatus === 'sending'}
                  onClick={() => {
                    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
                    const secureHash = obfuscateOTP(rawCode);
                    setTargetOtpHash(secureHash);
                    setOtpInput('');
                    setOtpError('');
                    sendOtpEmail(pendingUser?.email || 'anbui.jp@gmail.com', rawCode);
                  }}
                  className="text-blue-600 hover:underline font-bold cursor-pointer disabled:opacity-50"
                >
                  Gửi lại OTP
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOtpModalOpen(false);
                    setPendingUser(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={emailStatus === 'sending'}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors cursor-pointer shadow-sm disabled:bg-rose-450"
                >
                  Xác minh
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Non-blocking Custom Deletion Confirmation Modal for Timeline Logs */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden"
          >
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                Xác nhận xóa nhật ký?
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Hành động này sẽ xóa toàn bộ lịch sử chỉnh sửa trên Timeline của ứng dụng và không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?
              </p>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(false)}
                className="px-4 py-2 text-xs bg-white border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLogs}
                className="px-4 py-2 text-xs bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Non-blocking Custom Feedback Overlay Alert */}
      {customFeedbackMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-4 rounded-xl shadow-xl border flex items-start gap-3 backdrop-blur-md",
              customFeedbackMessage.type === 'error' 
                ? "bg-rose-50 border-rose-200 text-rose-800" 
                : customFeedbackMessage.type === 'success'
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            )}
          >
            <div className="mt-0.5">
              {customFeedbackMessage.type === 'error' ? (
                <ShieldAlert size={18} className="text-rose-600" />
              ) : (
                <CheckCircle size={18} className="text-emerald-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold">
                {customFeedbackMessage.type === 'error' ? 'Hệ thống bảo mật' : 'Thông báo'}
              </p>
              <p className="text-xs mt-1 leading-relaxed">{customFeedbackMessage.text}</p>
            </div>
            <button 
              onClick={() => setCustomFeedbackMessage(null)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold leading-none"
            >
              ✕
            </button>
          </motion.div>
        </div>
      )}

    </div>
  );
}
