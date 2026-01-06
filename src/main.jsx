import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend,
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid
}
    from 'recharts';
import {
    UploadCloud, TrendingUp, TrendingDown,
    Wallet, Search, X, Check, FileSpreadsheet,
    Calendar, Layers, Tag, User, BarChart2, ChevronDown, RotateCcw, MousePointerClick,
    Receipt, Clock, CreditCard, Hash, Copy, FileText
} from 'lucide-react';

// --- 常量定义 ---

const COLORS = ['#60A5FA', '#34D399', '#F472B6', '#A78BFA', '#FBBF24', '#6EE7B7', '#93C5FD', '#C4B5FD', '#CBD5E1'];

// --- 解析工具函数 ---

// 读取文件文本，支持指定编码
const readFileAsText = (file, encoding = 'UTF-8') => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file, encoding);
    });
};

// Excel 序列日期转 JS 字符串
const formatExcelSerialDate = (serial) => {
    if (!serial || isNaN(serial)) return '';
    // Excel base date is 1899-12-30. 
    // We use UTC methods to avoid local timezone interference on the pure math calculation
    const fractional_day = serial - Math.floor(serial) + 0.0000001;
    const total_seconds = Math.floor(86400 * fractional_day);
    const seconds = total_seconds % 60;
    const minutes = Math.floor(total_seconds / 60) % 60;
    const hours = Math.floor(total_seconds / 3600);

    const date_info = new Date((serial - 25569) * 86400 * 1000);

    // Correction for milliseconds precision
    const dt = new Date(date_info.getTime() + 100);

    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');

    // Use calculated time from serial fraction for better precision than Date object sometimes
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};

// 日期标准化函数：将各种格式转换为 YYYY-MM-DD HH:mm:ss
const normalizeDateStr = (val) => {
    if (val === null || val === undefined) return '';

    // 1. 处理 Excel 序列号 (数字类型)
    if (typeof val === 'number') {
        // 粗略判断范围，避免将普通金额误判为日期 (Excel日期 40000~50000 对应 2009~2036年)
        if (val > 30000 && val < 60000) {
            return formatExcelSerialDate(val);
        }
        return ''; // 非日期数字
    }

    // 2. 处理字符串类型
    let dateStr = String(val).trim();

    // 替换斜杠为横杠，处理 2023/01/01 格式
    dateStr = dateStr.replace(/\//g, '-');

    // 尝试提取标准日期部分
    const parts = dateStr.match(/^(\d{4})[-年](\d{1,2})[-月](\d{1,2})(?:\s+(\d{1,2})[:：](\d{1,2})[:：](\d{1,2}))?/);

    if (parts) {
        const y = parts[1];
        const m = parts[2].padStart(2, '0');
        const d = parts[3].padStart(2, '0');
        let time = '00:00:00';
        if (parts[4]) {
            const hh = parts[4].padStart(2, '0');
            const mm = parts[5].padStart(2, '0');
            const ss = parts[6].padStart(2, '0');
            time = `${hh}:${mm}:${ss}`;
        }
        return `${y}-${m}-${d} ${time}`;
    }

    return dateStr;
};

// 统一的数据清洗与映射函数
const normalizeRecord = (rawRecord, source) => {
    // 辅助函数：安全转换为字符串
    const getString = (val) => (val === null || val === undefined) ? '' : String(val).trim();

    // 辅助函数：安全解析金额
    const getNumber = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            // 去除 ¥, , 等符号
            return parseFloat(val.replace(/[¥,]/g, '')) || 0;
        }
        return 0;
    };

    // 获取原始时间值（可能是数字或字符串）
    const rawTime = rawRecord['交易时间'];

    // 基础字段映射
    const record = {
        '交易时间': normalizeDateStr(rawTime), // 使用增强版日期清洗
        '交易类型': getString(source === 'Alipay' ? rawRecord['交易分类'] : rawRecord['交易类型']),
        '交易对方': getString(rawRecord['交易对方']),
        '商品': getString(source === 'Alipay' ? rawRecord['商品说明'] : rawRecord['商品']),
        '收/支': getString(rawRecord['收/支']),
        '金额(元)': 0,
        '支付方式': getString(source === 'Alipay' ? rawRecord['收/付款方式'] : rawRecord['支付方式']),
        '当前状态': getString(source === 'Alipay' ? rawRecord['交易状态'] : rawRecord['当前状态']),
        '交易单号': getString(source === 'Alipay' ? rawRecord['交易订单号'] : rawRecord['交易单号']),
        '商户单号': getString(source === 'Alipay' ? rawRecord['商家订单号'] : rawRecord['商户单号']),
        '备注': getString(rawRecord['备注']),
        '来源': source  // 'WeChat' | 'Alipay'
    };

    // 金额处理
    if (source === 'WeChat') {
        record['金额(元)'] = getNumber(rawRecord['金额(元)']);
        // 处理微信特殊的中性交易标识 "/"
        if (record['收/支'] === '/') {
            record['收/支'] = '不计收支';
        }
    } else if (source === 'Alipay') {
        record['金额(元)'] = getNumber(rawRecord['金额']);
        // 默认值处理
        if (!record['交易类型']) record['交易类型'] = '其他';
        // 处理支付宝特有的“不计收支”
        if (record['收/支'] === '不计收支' || record['收/支'] === '') {
            record['收/支'] = '不计收支';
        }
    }

    // 通用清洗：去除单号中的制表符
    record['交易单号'] = record['交易单号'].replace(/\t/g, '');
    record['商户单号'] = record['商户单号'].replace(/\t/g, '');

    // 确保必要字段存在且有效
    if (!record['交易时间'] || isNaN(record['金额(元)'])) return null;

    return record;
};


const parseCSV = (text, fileName) => {
    const lines = text.split(/\r\n|\n/);

    let isAlipay = false;
    let headerIndex = -1;

    if (text.includes('支付宝交易明细') || text.includes('支付宝账户') || fileName.includes('支付宝')) {
        isAlipay = true;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('交易时间') && line.includes('金额(元)')) {
            headerIndex = i;
            isAlipay = false;
            break;
        }
        if (line.includes('交易时间') && line.includes('交易分类') && line.includes('商品说明')) {
            headerIndex = i;
            isAlipay = true;
            break;
        }
    }

    if (headerIndex === -1) return [];

    // 清洗 Header：去除可能的 BOM 字符 (\ufeff) 和引号
    const headers = lines[headerIndex].split(',').map(h => h.trim().replace(/^[\ufeff"]+|"$/g, ''));

    const data = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 优化的 CSV 分割正则
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));

        if (values.length < 5) continue;

        const rawRecord = {};
        headers.forEach((header, index) => {
            let val = values[index] ? values[index] : '';
            rawRecord[header] = val;
        });

        const normalized = normalizeRecord(rawRecord, isAlipay ? 'Alipay' : 'WeChat');
        if (normalized && normalized['交易单号']) {
            data.push(normalized);
        }
    }
    return data;
};

const parseExcel = async (file) => {
    return new Promise((resolve, reject) => {
        if (!window.XLSX) {
            reject("Excel library not loaded");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // 使用 header:1 读取为二维数组，defval: null 确保不会把空值转为空字符串，保留 undefined 方便后续判断
                const jsonData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                let headerIndex = -1;
                let isAlipay = false;

                // 查找表头行
                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    // 将行转为字符串来判断特征，注意过滤掉 null
                    const rowStr = row.filter(cell => cell !== null).join(',');
                    if (rowStr.includes('交易时间') && rowStr.includes('金额')) {
                        headerIndex = i;
                        if (rowStr.includes('交易分类')) isAlipay = true;
                        break;
                    }
                }

                if (headerIndex === -1) {
                    resolve([]);
                    return;
                }

                const headers = jsonData[headerIndex].map(h => String(h).trim().replace(/^[\ufeff"]+|"$/g, ''));
                const result = [];

                for (let i = headerIndex + 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;

                    const rawRecord = {};
                    headers.forEach((header, index) => {
                        // 保留原始数据类型 (可能是数字日期)
                        let val = row[index];
                        rawRecord[header] = val;
                    });

                    const normalized = normalizeRecord(rawRecord, isAlipay ? 'Alipay' : 'WeChat');
                    if (normalized && normalized['交易单号']) {
                        result.push(normalized);
                    }
                }
                resolve(result);
            } catch (err) {
                console.error("Error parsing Excel:", err);
                resolve([]);
            }
        };
        reader.readAsArrayBuffer(file);
    });
};


// --- 组件部分 ---

const Card = ({ children, className = "" }) => (
    <div className={`bg-white/40 backdrop-blur-md border border-white/30 shadow-lg rounded-2xl p-6 ${className}`}>
        {children}
    </div>
);

const StatCard = ({ title, amount, icon: Icon, colorClass }) => (
    <Card className="flex items-center space-x-4 transition-transform hover:scale-105 duration-300">
        <div className={`p-3 rounded-xl ${colorClass} bg-opacity-20 backdrop-blur-sm text-white`}>
            <Icon size={24} className={colorClass.replace('bg-', 'text-').replace('-500', '-600')} />
        </div>
        <div>
            <p className="text-slate-500 text-sm font-medium">{title}</p>
            <h3 className="text-2xl font-bold text-slate-800">¥ {amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
        </div>
    </Card>
);

const ToggleGroup = ({ options, value, onChange, iconMap, size = 'sm' }) => (
    <div className="flex bg-slate-200/50 p-1 rounded-lg">
        {options.map(opt => (
            <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`
          flex items-center justify-center rounded-md font-medium transition-all flex-1
          ${size === 'xs' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm'}
          ${value === opt.value
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                    }
        `}
            >
                {iconMap && iconMap[opt.value] && <span className="mr-1.5">{iconMap[opt.value]}</span>}
                {opt.label}
            </button>
        ))}
    </div>
);

// 交易详情模态框
const TransactionDetailModal = ({ transaction, onClose }) => {
    if (!transaction) return null;

    const isExpense = transaction['收/支'] === '支出';
    const isIncome = transaction['收/支'] === '收入';

    let themeColor = 'text-slate-600';
    let bgColor = 'bg-slate-50';
    let IconComponent = Wallet;

    if (isExpense) {
        themeColor = 'text-emerald-600';
        bgColor = 'bg-emerald-50';
        IconComponent = TrendingDown;
    } else if (isIncome) {
        themeColor = 'text-blue-600';
        bgColor = 'bg-blue-50';
        IconComponent = TrendingUp;
    }

    const InfoRow = ({ label, value, icon: Icon, fullWidth = false, copyable = false }) => (
        <div className={`flex flex-col space-y-1 ${fullWidth ? 'col-span-2' : ''}`}>
            <span className="text-xs text-slate-400 font-medium flex items-center">
                {Icon && <Icon size={12} className="mr-1.5" />}
                {label}
            </span>
            <div className="flex items-center justify-between group">
                <span className="text-sm text-slate-700 font-medium break-all">{value || '-'}</span>
                {copyable && value && value !== '/' && (
                    <button
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(value); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-all text-slate-400"
                        title="复制"
                    >
                        <Copy size={12} />
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`${bgColor} p-6 text-center relative border-b border-slate-100`}>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/50 hover:bg-white rounded-full transition-colors text-slate-500"
                    >
                        <X size={18} />
                    </button>

                    <div className={`mx-auto w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm ${themeColor}`}>
                        <IconComponent size={24} />
                    </div>
                    <h3 className="text-slate-500 text-sm font-medium mb-1">{transaction['商品']}</h3>
                    <div className={`text-3xl font-bold font-mono ${themeColor}`}>
                        {isExpense ? '-' : isIncome ? '+' : ''}{Number(transaction['金额(元)']).toFixed(2)}
                    </div>
                    <div className="flex justify-center items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium bg-white/60 text-slate-600`}>
                            {transaction['当前状态']}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${transaction['来源'] === 'Alipay' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {transaction['来源'] === 'Alipay' ? '支付宝' : '微信支付'}
                        </span>
                    </div>

                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                        <InfoRow label="交易时间" value={transaction['交易时间']} icon={Clock} fullWidth />
                        <InfoRow label="交易对象" value={transaction['交易对方']} icon={User} fullWidth />

                        <InfoRow label="交易类型" value={transaction['交易类型']} icon={Layers} />
                        <InfoRow label="支付方式" value={transaction['支付方式']} icon={CreditCard} />

                        <InfoRow label="收/支" value={transaction['收/支']} icon={Wallet} />
                        <InfoRow label="来源" value={transaction['来源'] === 'Alipay' ? '支付宝' : '微信'} icon={FileSpreadsheet} />

                        <InfoRow label="交易单号" value={transaction['交易单号']} icon={Hash} fullWidth copyable />
                        <InfoRow label="商户单号" value={transaction['商户单号']} icon={Receipt} fullWidth copyable />

                        {transaction['备注'] && transaction['备注'] !== '/' && (
                            <InfoRow label="备注" value={transaction['备注']} icon={Tag} fullWidth />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


// 日期范围选择浮窗组件
const DateRangePicker = ({ startDate, endDate, onStartChange, onEndChange, minDate, maxDate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleReset = () => {
        onStartChange('');
        onEndChange('');
    };

    const hasFilter = startDate || endDate;

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
          flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium
          ${isOpen || hasFilter
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white/50 border-slate-200 text-slate-600 hover:bg-white/80'
                    }
        `}
            >
                <Calendar size={16} />
                <span>
                    {startDate && endDate
                        ? `${startDate} 至 ${endDate}`
                        : startDate
                            ? `${startDate} 之后`
                            : endDate
                                ? `${endDate} 之前`
                                : '全部时间范围'
                    }
                </span>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 p-4 bg-white/90 backdrop-blur-xl border border-white/20 shadow-xl rounded-xl w-72 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">开始日期</label>
                            <input
                                type="date"
                                value={startDate}
                                min={minDate}
                                max={endDate || maxDate}
                                onChange={(e) => onStartChange(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">结束日期</label>
                            <input
                                type="date"
                                value={endDate}
                                min={startDate || minDate}
                                max={maxDate}
                                onChange={(e) => onEndChange(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                            <button
                                onClick={handleReset}
                                className="text-xs text-slate-500 hover:text-slate-700 flex items-center px-2 py-1 rounded hover:bg-slate-100"
                            >
                                <RotateCcw size={12} className="mr-1" /> 重置
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                确定
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


export default function App() {
    const [transactions, setTransactions] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('全部');
    const [loading, setLoading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    // 视图状态
    const [trendView, setTrendView] = useState('monthly');
    const [categoryView, setCategoryView] = useState('type');
    const [chartAnalysisType, setChartAnalysisType] = useState('支出');

    // 日期筛选状态
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // 分页状态
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // 动态加载 XLSX
    useEffect(() => {
        if (!window.XLSX) {
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            script.async = true;
            document.body.appendChild(script);
            return () => {
                try { document.body.removeChild(script); } catch (e) { console.warn(e); }
            }
        }
    }, []);

    const handleFileUpload = (event) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            processFiles(files);
        }
    };

    const processFiles = async (files) => {
        setLoading(true);
        let allNewTransactions = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let fileData = [];
            try {
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    fileData = await parseExcel(file);
                } else {
                    // 智能编码检测策略
                    const isAlipayName = file.name.includes('支付宝');
                    const defaultEncoding = isAlipayName ? 'GBK' : 'UTF-8';

                    let text = await readFileAsText(file, defaultEncoding);

                    // 验证解码
                    const hasWeChatHeader = text.includes('微信支付') || text.includes('交易时间');
                    const hasAlipayHeader = text.includes('支付宝') || (text.includes('交易分类') && text.includes('商品'));

                    if (!hasWeChatHeader && !hasAlipayHeader) {
                        const retryEncoding = defaultEncoding === 'GBK' ? 'UTF-8' : 'GBK';
                        console.log(`Initial parsing with ${defaultEncoding} failed to find headers. Retrying with ${retryEncoding}...`);
                        text = await readFileAsText(file, retryEncoding);
                    }

                    fileData = parseCSV(text, file.name);
                }
                allNewTransactions = allNewTransactions.concat(fileData);
            } catch (err) {
                console.error(`Failed to parse file ${file.name}`, err);
            }
        }

        setTransactions(prev => {
            const existingMap = new Map(prev.map(t => [t['交易单号'], t]));
            let duplicatesCount = 0;
            allNewTransactions.forEach(t => {
                if (existingMap.has(t['交易单号'])) duplicatesCount++;
                else existingMap.set(t['交易单号'], t);
            });
            const merged = Array.from(existingMap.values());
            // 按时间倒序排列 (确保时间比较是安全的)
            merged.sort((a, b) => {
                const dateA = a['交易时间'] || '';
                const dateB = b['交易时间'] || '';
                return dateB.localeCompare(dateA);
            });

            setUploadStatus({
                total: merged.length,
                newAdded: allNewTransactions.length - duplicatesCount,
                duplicates: duplicatesCount
            });
            setTimeout(() => setUploadStatus(null), 5000);
            return merged;
        });
        setLoading(false);
    };

    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => { setIsDragging(false); };
    const onDrop = (e) => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); };

    // --- 交互逻辑 ---

    const handleChartClick = (data) => {
        if (!data || !data.activeLabel) return;

        const label = String(data.activeLabel); // 确保是字符串
        let newStart = '';
        let newEnd = '';

        if (trendView === 'daily') {
            newStart = label;
            newEnd = label;
        } else if (trendView === 'monthly') {
            const parts = label.split('-');
            if (parts.length >= 2) {
                const [year, month] = parts;
                newStart = `${label}-01`;
                const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                newEnd = `${label}-${lastDay}`;
            }
        } else if (trendView === 'yearly') {
            newStart = `${label}-01-01`;
            newEnd = `${label}-12-31`;
        }

        if (newStart && newEnd) {
            setStartDate(newStart);
            setEndDate(newEnd);
        }
    };

    // --- 数据过滤 ---

    const { dataMinDate, dataMaxDate } = useMemo(() => {
        if (transactions.length === 0) return { dataMinDate: '', dataMaxDate: '' };
        // 强制转换为字符串再处理，防止数字类型的日期导致 crash
        const times = transactions
            .map(t => String(t['交易时间'] || ''))
            .filter(t => t.length > 0)
            .sort();

        const min = times[0]?.split(' ')[0] || '';
        const max = times[times.length - 1]?.split(' ')[0] || '';
        return { dataMinDate: min, dataMaxDate: max };
    }, [transactions]);

    const filteredData = useMemo(() => {
        return transactions.filter(t => {
            // 确保字段存在再调用 includes
            const matchesSearch =
                (t['商品'] && t['商品'].includes(searchTerm)) ||
                (t['交易对方'] && t['交易对方'].includes(searchTerm)) ||
                (t['交易类型'] && t['交易类型'].includes(searchTerm)) ||
                (t['支付方式'] && t['支付方式'].includes(searchTerm));

            const matchesType = filterType === '全部' ? true : t['收/支'] === filterType;

            let matchesDate = true;
            // 安全获取日期字符串
            const tDate = t['交易时间'] ? String(t['交易时间']).split(' ')[0] : '';

            if (startDate && tDate < startDate) matchesDate = false;
            if (endDate && tDate > endDate) matchesDate = false;

            return matchesSearch && matchesType && matchesDate;
        });
    }, [transactions, searchTerm, filterType, startDate, endDate]);

    // 分页数据计算
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return filteredData.slice(start, end);
    }, [filteredData, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        return Math.ceil(filteredData.length / itemsPerPage);
    }, [filteredData.length, itemsPerPage]);

    // 当筛选条件变化时，重置到第一页
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType, startDate, endDate]);

    const stats = useMemo(() => {
        let income = 0, expense = 0, neutral = 0;
        filteredData.forEach(t => {
            const amount = t['金额(元)'];
            if (t['收/支'] === '收入') income += amount;
            else if (t['收/支'] === '支出') expense += amount;
            else neutral += amount;
        });
        return { income, expense, neutral, total: income - expense };
    }, [filteredData]);

    // --- 动态聚合逻辑 ---

    const trendData = useMemo(() => {
        const map = {};
        filteredData.forEach(t => {
            const dateStr = String(t['交易时间'] || '');
            let key = 'Unknown';

            // 增加 undefined 检查
            if (trendView === 'daily') key = dateStr.split(' ')[0] || 'Unknown';
            else if (trendView === 'monthly') key = dateStr.slice(0, 7) || 'Unknown';
            else if (trendView === 'yearly') key = dateStr.slice(0, 4) || 'Unknown';

            if (!map[key]) map[key] = { date: key, 收入: 0, 支出: 0 };
            if (t['收/支'] === '收入') map[key].收入 += t['金额(元)'];
            if (t['收/支'] === '支出') map[key].支出 += t['金额(元)'];
        });

        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredData, trendView]);

    const categoryData = useMemo(() => {
        const targetData = filteredData.filter(t => t['收/支'] === chartAnalysisType);
        const map = {};

        targetData.forEach(t => {
            let key = '其他';
            if (categoryView === 'type') key = t['交易类型'];
            else if (categoryView === 'counterparty') key = t['交易对方'] === '/' ? '未知商户' : t['交易对方'];
            else if (categoryView === 'product') key = t['商品'];
            else if (categoryView === 'method') key = t['支付方式'];

            if (!key || key.trim() === '') key = '其他';
            map[key] = (map[key] || 0) + t['金额(元)'];
        });

        let result = Object.keys(map).map(key => ({ name: key, value: map[key] }));
        result.sort((a, b) => b.value - a.value);

        if (result.length > 50) {
            const top50 = result.slice(0, 50);
            const others = result.slice(50).reduce((sum, item) => sum + item.value, 0);
            top50.push({ name: '其他', value: others });
            return top50;
        }
        return result;
    }, [filteredData, categoryView, chartAnalysisType]);


    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-indigo-100 p-4 md:p-8 font-sans text-slate-800">
            {loading && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/50 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent"></div>
                </div>
            )}
            {/* 交易详情模态框 */}
            <TransactionDetailModal
                transaction={selectedTransaction}
                onClose={() => setSelectedTransaction(null)}
            />

            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header & Main Controls */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-2">
                            全能账单透视
                        </h1>
                        <p className="text-slate-500 text-sm">
                            兼容微信支付 & 支付宝账单。支持多文件合并、自动编码识别、多维度数据洞察。
                        </p>
                    </div>

                    {transactions.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                            <DateRangePicker
                                startDate={startDate}
                                endDate={endDate}
                                onStartChange={setStartDate}
                                onEndChange={setEndDate}
                                minDate={dataMinDate}
                                maxDate={dataMaxDate}
                            />

                            <button
                                onClick={() => {
                                    setTransactions([]);
                                    setSearchTerm('');
                                    setUploadStatus(null);
                                    setStartDate('');
                                    setEndDate('');
                                }}
                                className="px-4 py-2 bg-white/50 hover:bg-white/80 text-slate-600 text-sm font-medium rounded-lg backdrop-blur shadow-sm transition-all border border-slate-200 flex items-center justify-center"
                            >
                                <X size={16} className="mr-2" /> 清空
                            </button>
                        </div>
                    )}
                </div>

                {/* Toast */}
                {uploadStatus && (
                    <div className="fixed top-4 right-4 md:top-8 md:right-8 z-50 animate-in fade-in slide-in-from-top-4">
                        <div className="bg-white/90 backdrop-blur shadow-xl rounded-xl p-4 border border-green-100 flex items-start space-x-3 max-w-sm">
                            <div className="bg-green-100 p-2 rounded-full text-green-600">
                                <Check size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800">导入完成</h4>
                                <p className="text-sm text-slate-600 mt-1">
                                    新增 <span className="font-bold text-blue-600">{uploadStatus.newAdded}</span> 条，
                                    去重 <span className="font-bold text-orange-500">{uploadStatus.duplicates}</span> 条。
                                    <br />当前共 {uploadStatus.total} 条。
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Upload Area */}
                {transactions.length === 0 && (
                    <div
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        className={`
              relative group cursor-pointer border-3 border-dashed rounded-3xl p-16
              flex flex-col items-center justify-center text-center transition-all duration-300
              ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.02]' : 'border-slate-300 hover:border-blue-400 bg-white/30 hover:bg-white/50 backdrop-blur-sm'}
            `}
                    >
                        <input type="file" multiple accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className={`flex gap-3 mb-6 transition-transform group-hover:scale-110 duration-300`}>
                            <div className="p-5 rounded-full bg-blue-100"><FileText size={48} className="text-blue-500" /></div>
                            <div className="p-5 rounded-full bg-green-100"><FileSpreadsheet size={48} className="text-green-500" /></div>
                        </div>
                        <h3 className="text-xl font-bold text-slate-700 mb-2">点击或拖拽上传账单</h3>
                        <p className="text-slate-500 max-w-md">
                            支持 <span className="font-bold text-blue-500">微信支付</span> 与 <span className="font-bold text-blue-500">支付宝</span> 账单文件 (CSV/Excel)。
                            <br />
                            <span className="text-xs">系统自动处理 GBK 编码与字段合并。</span>
                        </p>
                    </div>
                )}

                {/* Dashboard */}
                {transactions.length > 0 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700">

                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <StatCard title="总支出" amount={stats.expense} icon={TrendingDown} colorClass="bg-emerald-500" />
                            <StatCard title="总收入" amount={stats.income} icon={TrendingUp} colorClass="bg-blue-500" />
                            <StatCard title="结余 (收-支)" amount={stats.total} icon={Wallet} colorClass={stats.total >= 0 ? "bg-indigo-500" : "bg-rose-500"} />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Left: Aggregation Pie Chart */}
                            <Card className="lg:col-span-1 min-h-[550px] flex flex-col">
                                <div className="mb-4 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-lg font-bold text-slate-700 flex items-center">
                                            <span className={`w-2 h-6 rounded-full mr-3 ${chartAnalysisType === '支出' ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
                                            {chartAnalysisType}分布
                                        </h3>

                                        {/* 收支切换开关 */}
                                        <div className="flex bg-slate-200/50 p-1 rounded-lg">
                                            {['支出', '收入'].map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setChartAnalysisType(type)}
                                                    className={`
                            px-3 py-1 rounded-md text-xs font-medium transition-all
                            ${chartAnalysisType === type
                                                            ? (type === '支出' ? 'bg-white text-emerald-600 shadow-sm' : 'bg-white text-blue-600 shadow-sm')
                                                            : 'text-slate-500 hover:text-slate-700'
                                                        }
                          `}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <ToggleGroup
                                        value={categoryView}
                                        onChange={setCategoryView}
                                        options={[
                                            { value: 'type', label: '类型' },
                                            { value: 'counterparty', label: '商户' },
                                            { value: 'product', label: '商品' },
                                            { value: 'method', label: '账户' }
                                        ]}
                                        iconMap={{
                                            type: <Layers size={14} />,
                                            counterparty: <User size={14} />,
                                            product: <Tag size={14} />,
                                            method: <CreditCard size={14} />
                                        }}
                                    />
                                </div>

                                {categoryData.length > 0 ? (
                                    <>
                                        <div className="h-[250px] w-full shrink-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={categoryData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={2}
                                                        dataKey="value"
                                                    >
                                                        {categoryData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <RechartsTooltip
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        formatter={(value) => `¥${value.toLocaleString()}`}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Top List */}
                                        <div className="mt-4 flex-1 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Top {chartAnalysisType}来源/去向</h4>
                                            <div className="space-y-2">
                                                {categoryData.map((item, index) => (
                                                    <div key={index} className="flex items-center justify-between text-sm p-2 rounded-lg bg-slate-50/50 hover:bg-white transition-colors">
                                                        <div className="flex items-center space-x-2 overflow-hidden">
                                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                                            <span className="truncate max-w-[120px] font-medium text-slate-700" title={item.name}>{item.name}</span>
                                                        </div>
                                                        <span className="font-mono text-slate-600">¥{item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                        <PieChart size={48} className="mb-2 opacity-20" />
                                        <p className="text-sm">该维度下无{chartAnalysisType}数据</p>
                                    </div>
                                )}
                            </Card>

                            {/* Right: Trend Chart */}
                            <Card className="lg:col-span-2 min-h-[550px]">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-lg font-bold text-slate-700 flex items-center">
                                            <span className="w-2 h-6 bg-indigo-500 rounded-full mr-3"></span>
                                            收支趋势
                                        </h3>

                                        {(startDate || endDate) ? (
                                            <button
                                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                                className="text-xs flex items-center bg-orange-100 text-orange-600 px-2 py-1 rounded-full hover:bg-orange-200 transition-colors animate-in fade-in"
                                            >
                                                <RotateCcw size={12} className="mr-1" />
                                                重置范围
                                            </button>
                                        ) : (
                                            <span className="text-xs text-slate-400 flex items-center bg-slate-100 px-2 py-1 rounded-full">
                                                <MousePointerClick size={12} className="mr-1" />
                                                点击图表可钻取详细
                                            </span>
                                        )}
                                    </div>

                                    <div className="w-full sm:w-auto">
                                        <ToggleGroup
                                            value={trendView}
                                            onChange={setTrendView}
                                            options={[
                                                { value: 'daily', label: '按日' },
                                                { value: 'monthly', label: '按月' },
                                                { value: 'yearly', label: '按年' }
                                            ]}
                                            iconMap={{
                                                daily: <Calendar size={14} />,
                                                monthly: <Calendar size={14} />,
                                                yearly: <BarChart2 size={14} />
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="h-[450px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={trendData}
                                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                            onClick={handleChartClick}
                                            className="cursor-pointer"
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis
                                                dataKey="date"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748B', fontSize: 12 }}
                                                minTickGap={30}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748B', fontSize: 12 }}
                                            />
                                            <RechartsTooltip
                                                cursor={{ fill: 'rgba(96, 165, 250, 0.1)' }}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            />
                                            <Legend iconType="circle" />
                                            <Bar
                                                dataKey="收入"
                                                fill="#60A5FA"
                                                radius={[4, 4, 0, 0]}
                                                maxBarSize={60}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <Bar
                                                dataKey="支出"
                                                fill="#34D399"
                                                radius={[4, 4, 0, 0]}
                                                maxBarSize={60}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        </div>

                        {/* List Table */}
                        <Card className="overflow-hidden">
                            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                                <h3 className="text-lg font-bold text-slate-700 flex items-center self-start md:self-center">
                                    <span className="w-2 h-6 bg-pink-400 rounded-full mr-3"></span>
                                    交易明细 ({filteredData.length})
                                </h3>

                                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                                    <div className="flex bg-slate-100/50 p-1 rounded-lg backdrop-blur-sm">
                                        {['全部', '支出', '收入', '不计收支'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => setFilterType(type)}
                                                className={`
                          px-3 py-1.5 rounded-md text-sm font-medium transition-all
                          ${filterType === type ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                        `}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 group-hover:text-blue-500 transition-colors" size={18} />
                                        <input
                                            type="text"
                                            placeholder="搜索..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-100/50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all placeholder-slate-400 text-slate-700 text-sm"
                                        />
                                    </div>

                                    <div className="relative overflow-hidden">
                                        <input type="file" multiple accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                        <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg shadow transition-colors flex items-center whitespace-nowrap">
                                            <UploadCloud size={16} className="mr-2" /> 追加文件
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-slate-500 text-sm border-b border-slate-200/60">
                                            <th className="pb-3 pl-2 font-medium">交易时间</th>
                                            <th className="pb-3 font-medium">来源</th>
                                            <th className="pb-3 font-medium">类型</th>
                                            <th className="pb-3 font-medium">交易对象/商品</th>
                                            <th className="pb-3 font-medium">支付方式</th>
                                            <th className="pb-3 font-medium">收/支</th>
                                            <th className="pb-3 font-medium text-right pr-2">金额</th>
                                            <th className="pb-3 font-medium text-center">状态</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {paginatedData.map((t, idx) => (
                                            <tr
                                                key={`${t['交易单号']}-${idx}`}
                                                onClick={() => setSelectedTransaction(t)}
                                                className="group hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer"
                                            >
                                                <td className="py-3 pl-2 text-slate-500 whitespace-nowrap">{t['交易时间']}</td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${t['来源'] === 'Alipay' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                        {t['来源'] === 'Alipay' ? '支付宝' : '微信'}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-slate-600 max-w-[120px] truncate" title={t['交易类型']}>{t['交易类型']}</td>
                                                <td className="py-3 text-slate-800 font-medium max-w-[200px] truncate" title={`${t['交易对方']} - ${t['商品']}`}>
                                                    {t['交易对方'] === '/' ? t['商品'] : t['交易对方']}
                                                </td>
                                                <td className="py-3 text-slate-600 max-w-[100px] truncate" title={t['支付方式']}>
                                                    {t['支付方式']}
                                                </td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t['收/支'] === '支出' ? 'bg-green-100 text-green-700' :
                                                        t['收/支'] === '收入' ? 'bg-blue-100 text-blue-700' :
                                                            'bg-slate-100 text-slate-600'
                                                        }`}>
                                                        {t['收/支']}
                                                    </span>
                                                </td>
                                                <td className={`py-3 text-right pr-2 font-mono font-bold ${t['收/支'] === '支出' ? 'text-green-600' : t['收/支'] === '收入' ? 'text-blue-600' : 'text-slate-600'
                                                    }`}>
                                                    {t['收/支'] === '支出' ? '-' : '+'}
                                                    {t['金额(元)'].toFixed(2)}
                                                </td>
                                                <td className="py-3 text-center text-slate-400 text-xs">{t['当前状态']}</td>
                                            </tr>
                                        ))}
                                        {filteredData.length === 0 && (
                                            <tr><td colSpan="8" className="text-center py-8 text-slate-400">没有找到相关记录</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* 分页控制器 */}
                            {filteredData.length > 0 && (
                                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-4 pb-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-slate-600">每页显示</span>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => {
                                                setItemsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                                        >
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                            <option value={200}>200</option>
                                        </select>
                                        <span className="text-sm text-slate-600">
                                            共 {filteredData.length} 条记录
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                                        >
                                            上一页
                                        </button>
                                        
                                        <div className="flex items-center gap-1">
                                            {(() => {
                                                const pages = [];
                                                
                                                if (totalPages <= 7) {
                                                    // 如果总页数小于等于7，显示所有页码
                                                    for (let i = 1; i <= totalPages; i++) {
                                                        pages.push(i);
                                                    }
                                                } else {
                                                    // 总是显示前3页
                                                    pages.push(1, 2, 3);
                                                    
                                                    // 总是显示后3页
                                                    const lastThree = [totalPages - 2, totalPages - 1, totalPages];
                                                    
                                                    // 检查前3页和后3页是否有重叠或相邻
                                                    if (3 < totalPages - 3) {
                                                        // 有间隔，添加省略号
                                                        pages.push('...');
                                                        pages.push(...lastThree);
                                                    } else {
                                                        // 无间隔或紧邻，填充中间的页码
                                                        for (let i = 4; i <= totalPages; i++) {
                                                            pages.push(i);
                                                        }
                                                    }
                                                }
                                                
                                                return pages.map((page, idx) => {
                                                    if (page === '...') {
                                                        return (
                                                            <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">
                                                                ...
                                                            </span>
                                                        );
                                                    }
                                                    
                                                    return (
                                                        <button
                                                            key={page}
                                                            onClick={() => setCurrentPage(page)}
                                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                                                currentPage === page
                                                                    ? 'bg-blue-500 text-white shadow-md'
                                                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                                                            }`}
                                                        >
                                                            {page}
                                                        </button>
                                                    );
                                                });
                                            })()}
                                        </div>

                                        {/* 页码跳转输入框 */}
                                        <div className="flex items-center gap-1 ml-2">
                                            <span className="text-sm text-slate-600">跳至</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max={totalPages}
                                                placeholder={currentPage}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const value = parseInt(e.target.value);
                                                        if (value >= 1 && value <= totalPages) {
                                                            setCurrentPage(value);
                                                            e.target.value = '';
                                                        }
                                                    }
                                                }}
                                                className="w-16 px-2 py-1.5 text-center bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            />
                                            <span className="text-sm text-slate-600">页</span>
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                                        >
                                            下一页
                                        </button>
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}