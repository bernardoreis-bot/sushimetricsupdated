import { useEffect, useState, useMemo } from 'react';
import { Users, TrendingUp, TrendingDown, Clock, DollarSign, Plus, X, Settings, Calendar, Download, Upload, Edit2, Trash2, Filter, Info, HelpCircle, BarChart3, PieChart, LineChart } from 'lucide-react';
import { LineChart as RechartsLine, Line, BarChart, Bar, PieChart as RechartsPie, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart, Area, ReferenceLine } from 'recharts';
import { supabase } from '../lib/supabase';
import {
  StaffMember,
  PERIOD_PRESETS,
  calculateTurnoverRate,
  calculateRetentionRate,
  calculateAverageHeadcount,
  calculateTrainingCost,
  getTotalTrainingCost,
  getActiveStaff,
  getInactiveStaff,
  filterStaffByPeriod,
  filterStaffByDepartment,
  getUniqueDepartments,
  getAverageTrainingCost,
  getAverageTrainingHours,
  getStaffWithTrainingCount,
  generateHistoricalData,
  DEFAULT_INDUSTRY_BENCHMARKS,
  type HistoricalDataPoint
} from '../utils/peopleTrackerCalculations';
import {
  exportToCSV,
  downloadSampleTemplate,
  parseCSV,
  validateImportRow,
  ImportRow
} from '../utils/peopleTrackerImportExport';
import { formatUKDate, convertUKDateToISO } from '../utils/dateFormat';

type StaffFilter = 'all' | 'active' | 'inactive';

interface DashboardState {
  selectedPeriod: string;
  customStartDate: string;
  customEndDate: string;
  filter: StaffFilter;
  selectedDepartments: string[];
  sortField: keyof StaffMember;
  sortDirection: 'asc' | 'desc';
}

// Custom tooltip for Turnover & Retention chart with calculation details
const TurnoverRetentionTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 border border-gray-300 rounded-lg shadow-lg max-w-sm">
        <p className="font-bold text-gray-900 mb-2">{data.period}</p>

        <div className="space-y-3 text-sm">
          {/* Turnover Rate Section */}
          <div className="border-l-4 border-red-500 pl-2">
            <p className="font-semibold text-red-600">Turnover Rate: {data.turnoverRate.toFixed(1)}%</p>
            <p className="text-xs text-gray-600 mt-1">
              <strong>Formula:</strong> (Separations ÷ Avg Headcount) × 100
            </p>
            <div className="text-xs text-gray-700 mt-1 space-y-0.5">
              <p>• Start headcount: {data.startHeadcount}</p>
              <p>• End headcount: {data.endHeadcount}</p>
              <p>• Avg headcount: {data.avgHeadcount.toFixed(1)}</p>
              <p>• Separations: {data.separations}</p>
              <p className="text-red-600 font-medium">= ({data.separations} ÷ {data.avgHeadcount.toFixed(1)}) × 100 = {data.turnoverRate.toFixed(1)}%</p>
            </div>
          </div>

          {/* Retention Rate Section */}
          <div className="border-l-4 border-green-500 pl-2">
            <p className="font-semibold text-green-600">Retention Rate: {data.retentionRate.toFixed(1)}%</p>
            <p className="text-xs text-gray-600 mt-1">
              <strong>Formula:</strong> (Remained ÷ Start Headcount) × 100
            </p>
            <div className="text-xs text-gray-700 mt-1 space-y-0.5">
              <p>• Start headcount: {data.startHeadcount}</p>
              <p>• Remained at end: {data.remainedCount}</p>
              <p className="text-green-600 font-medium">= ({data.remainedCount} ÷ {data.startHeadcount}) × 100 = {data.retentionRate.toFixed(1)}%</p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="border-t pt-2 mt-2">
            <p className="text-xs text-gray-600">
              <strong>Period Activity:</strong>
            </p>
            <div className="text-xs text-gray-700 space-y-0.5">
              <p>• New hires: {data.newHires}</p>
              <p>• Separations: {data.separations}</p>
              <p>• Net change: {data.newHires - data.separations > 0 ? '+' : ''}{data.newHires - data.separations}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function PeopleTrackerEnhanced() {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentHourlyRate, setCurrentHourlyRate] = useState(12.21);

  // Industry benchmarks
  const [benchmarkRetentionRate, setBenchmarkRetentionRate] = useState(DEFAULT_INDUSTRY_BENCHMARKS.retentionRate);
  const [benchmarkTurnoverRate, setBenchmarkTurnoverRate] = useState(DEFAULT_INDUSTRY_BENCHMARKS.turnoverRate);
  const [benchmarkId, setBenchmarkId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    start_date: '',
    end_date: '',
    training_hours: '',
    department: 'General',
    notes: ''
  });
  const [newHourlyRate, setNewHourlyRate] = useState('12.21');
  const [newRetentionRate, setNewRetentionRate] = useState('33');
  const [newTurnoverRate, setNewTurnoverRate] = useState('67');

  // Dashboard state with persistence
  const [dashboardState, setDashboardState] = useState<DashboardState>(() => {
    const saved = localStorage.getItem('peopleTracker_dashboardState');
    if (saved) {
      return JSON.parse(saved);
    }
    const today = new Date();
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    return {
      selectedPeriod: '1 Year',
      customStartDate: yearAgo.toISOString().split('T')[0],
      customEndDate: today.toISOString().split('T')[0],
      filter: 'all' as StaffFilter,
      selectedDepartments: [],
      sortField: 'start_date' as keyof StaffMember,
      sortDirection: 'desc' as 'asc' | 'desc'
    };
  });

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('peopleTracker_dashboardState', JSON.stringify(dashboardState));
  }, [dashboardState]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: staff, error: staffError } = await supabase
        .from('staff_members')
        .select('*')
        .order('created_at', { ascending: false });

      if (staffError) throw staffError;

      const { data: config, error: configError } = await supabase
        .from('training_config')
        .select('*')
        .is('site_id', null)
        .maybeSingle();

      if (configError) throw configError;

      const { data: benchmarks, error: benchmarkError } = await supabase
        .from('people_tracker_benchmarks')
        .select('*')
        .is('site_id', null)
        .maybeSingle();

      if (benchmarkError) throw benchmarkError;

      if (staff) {
        setStaffMembers(staff);
      }

      if (config) {
        setCurrentHourlyRate(parseFloat(config.hourly_rate));
        setNewHourlyRate(config.hourly_rate.toString());
      }

      if (benchmarks) {
        setBenchmarkRetentionRate(parseFloat(benchmarks.retention_rate));
        setBenchmarkTurnoverRate(parseFloat(benchmarks.turnover_rate));
        setBenchmarkId(benchmarks.id);
        setNewRetentionRate(benchmarks.retention_rate.toString());
        setNewTurnoverRate(benchmarks.turnover_rate.toString());
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error loading people tracker data:', err);
      alert('Failed to load data: ' + err.message);
      setLoading(false);
    }
  };

  const getPeriodDates = (): { startDate: Date; endDate: Date } => {
    const endDate = new Date(dashboardState.customEndDate);
    let startDate: Date;

    if (dashboardState.selectedPeriod === 'Custom') {
      startDate = new Date(dashboardState.customStartDate);
    } else {
      const preset = PERIOD_PRESETS.find(p => p.label === dashboardState.selectedPeriod);
      if (preset) {
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - preset.days);
      } else {
        startDate = new Date(endDate);
        startDate.setFullYear(startDate.getFullYear() - 1);
      }
    }

    return { startDate, endDate };
  };

  const filteredStaff = useMemo(() => {
    let filtered = [...staffMembers];

    // Apply status filter
    if (dashboardState.filter === 'active') {
      filtered = getActiveStaff(filtered);
    } else if (dashboardState.filter === 'inactive') {
      filtered = getInactiveStaff(filtered);
    }

    // Apply department filter
    filtered = filterStaffByDepartment(filtered, dashboardState.selectedDepartments);

    // Apply period filter
    const { startDate, endDate } = getPeriodDates();
    filtered = filterStaffByPeriod(filtered, startDate, endDate);

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[dashboardState.sortField];
      const bVal = b[dashboardState.sortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return dashboardState.sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [staffMembers, dashboardState]);

  const metrics = useMemo(() => {
    const { startDate, endDate } = getPeriodDates();

    const turnoverRate = calculateTurnoverRate(staffMembers, startDate, endDate);
    const retentionRate = calculateRetentionRate(staffMembers, startDate, endDate);
    const avgHeadcount = calculateAverageHeadcount(staffMembers, startDate, endDate);
    const totalTrainingCost = getTotalTrainingCost(filteredStaff, currentHourlyRate);
    const avgTrainingCost = getAverageTrainingCost(filteredStaff, currentHourlyRate);
    const avgTrainingHours = getAverageTrainingHours(filteredStaff);
    const staffWithTrainingCount = getStaffWithTrainingCount(filteredStaff);

    return {
      turnoverRate,
      retentionRate,
      avgHeadcount,
      totalTrainingCost,
      avgTrainingCost,
      avgTrainingHours,
      staffWithTrainingCount,
      activeCount: getActiveStaff(staffMembers).length,
      inactiveCount: getInactiveStaff(staffMembers).length
    };
  }, [staffMembers, filteredStaff, currentHourlyRate, dashboardState]);

  const historicalData = useMemo(() => {
    return generateHistoricalData(staffMembers, currentHourlyRate, 12);
  }, [staffMembers, currentHourlyRate]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();

    // Duplicate check
    const isDuplicate = staffMembers.some(s => {
      if (s.name.toLowerCase() !== formData.name.toLowerCase()) return false;
      const existingStart = new Date(s.start_date);
      const existingEnd = s.end_date ? new Date(s.end_date) : new Date('2099-12-31');
      const newStart = new Date(formData.start_date);
      const newEnd = formData.end_date ? new Date(formData.end_date) : new Date('2099-12-31');
      return (newStart <= existingEnd && newEnd >= existingStart);
    });

    if (isDuplicate) {
      alert('A staff member with this name already exists with an overlapping employment period.');
      return;
    }

    try {
      const newStaff = {
        name: formData.name,
        role: formData.role,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        training_hours: parseFloat(formData.training_hours) || 0,
        department: formData.department,
        notes: formData.notes || null,
        site_id: null,
        is_archived: false
      };

      const { data, error } = await supabase.from('staff_members').insert([newStaff]).select();
      if (error) throw error;

      // Log audit
      await supabase.from('people_tracker_audit_log').insert({
        table_name: 'staff_members',
        record_id: data[0].id,
        action: 'INSERT',
        new_data: newStaff
      });

      setFormData({ name: '', role: '', start_date: '', end_date: '', training_hours: '', department: 'General', notes: '' });
      setShowAddModal(false);
      await loadData();
      alert('Staff member added successfully!');
    } catch (err: any) {
      console.error('Error adding staff member:', err);
      alert('Failed to add staff member: ' + err.message);
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    try {
      const updatedData = {
        name: formData.name,
        role: formData.role,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        training_hours: parseFloat(formData.training_hours) || 0,
        department: formData.department,
        notes: formData.notes || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('staff_members')
        .update(updatedData)
        .eq('id', editingStaff.id);

      if (error) throw error;

      // Log audit
      await supabase.from('people_tracker_audit_log').insert({
        table_name: 'staff_members',
        record_id: editingStaff.id,
        action: 'UPDATE',
        old_data: editingStaff,
        new_data: updatedData
      });

      setShowEditModal(false);
      setEditingStaff(null);
      await loadData();
      alert('Staff member updated successfully!');
    } catch (err: any) {
      console.error('Error updating staff member:', err);
      alert('Failed to update staff member: ' + err.message);
    }
  };

  const handleDeleteStaff = async (staff: StaffMember) => {
    if (!confirm(`Are you sure you want to delete ${staff.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('staff_members')
        .delete()
        .eq('id', staff.id);

      if (error) throw error;

      // Log audit
      await supabase.from('people_tracker_audit_log').insert({
        table_name: 'staff_members',
        record_id: staff.id,
        action: 'DELETE',
        old_data: staff
      });

      await loadData();
      alert('Staff member deleted successfully!');
    } catch (err: any) {
      console.error('Error deleting staff member:', err);
      alert('Failed to delete staff member: ' + err.message);
    }
  };

  const openEditModal = (staff: StaffMember) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      role: staff.role,
      start_date: staff.start_date,
      end_date: staff.end_date || '',
      training_hours: staff.training_hours.toString(),
      department: staff.department || 'General',
      notes: staff.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateHourlyRate = async () => {
    try {
      const rate = parseFloat(newHourlyRate);
      if (isNaN(rate) || rate < 0) {
        alert('Please enter a valid hourly rate');
        return;
      }

      const { data: existing, error: selectError } = await supabase
        .from('training_config')
        .select('id')
        .is('site_id', null)
        .maybeSingle();

      if (selectError) throw selectError;

      let error;
      if (existing) {
        const result = await supabase
          .from('training_config')
          .update({ hourly_rate: rate, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        error = result.error;
      } else {
        const result = await supabase
          .from('training_config')
          .insert({ site_id: null, hourly_rate: rate });
        error = result.error;
      }

      if (error) throw error;

      setShowConfigModal(false);
      await loadData();
      alert('Hourly rate updated successfully! Only active staff training costs will be recalculated.');
    } catch (err: any) {
      console.error('Error updating hourly rate:', err);
      alert('Failed to update hourly rate: ' + err.message);
    }
  };

  const handleUpdateBenchmarks = async () => {
    try {
      const retentionRate = parseFloat(newRetentionRate);
      const turnoverRate = parseFloat(newTurnoverRate);

      if (isNaN(retentionRate) || retentionRate < 0 || retentionRate > 100) {
        alert('Please enter a valid retention rate between 0 and 100');
        return;
      }

      if (isNaN(turnoverRate) || turnoverRate < 0 || turnoverRate > 100) {
        alert('Please enter a valid turnover rate between 0 and 100');
        return;
      }

      if (!newRetentionRate.trim() || !newTurnoverRate.trim()) {
        alert('Both retention rate and turnover rate are required. These fields cannot be blank.');
        return;
      }

      const updateData = {
        retention_rate: retentionRate,
        turnover_rate: turnoverRate,
        updated_at: new Date().toISOString()
      };

      let error;
      if (benchmarkId) {
        const result = await supabase
          .from('people_tracker_benchmarks')
          .update(updateData)
          .eq('id', benchmarkId);
        error = result.error;
      } else {
        const result = await supabase
          .from('people_tracker_benchmarks')
          .insert({ site_id: null, ...updateData })
          .select();
        error = result.error;
        if (!error && result.data && result.data.length > 0) {
          setBenchmarkId(result.data[0].id);
        }
      }

      if (error) throw error;

      // Update state immediately for real-time graph update
      setBenchmarkRetentionRate(retentionRate);
      setBenchmarkTurnoverRate(turnoverRate);

      // Log audit
      await supabase.from('people_tracker_audit_log').insert({
        table_name: 'people_tracker_benchmarks',
        record_id: benchmarkId || '00000000-0000-0000-0000-000000000000',
        action: 'UPDATE',
        new_data: updateData
      });

      setShowBenchmarkModal(false);
      alert('Industry benchmarks updated successfully! Charts will now reflect the new values.');
    } catch (err: any) {
      console.error('Error updating benchmarks:', err);
      alert('Failed to update benchmarks: ' + err.message);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      const errors: string[] = [];
      const validRows: ImportRow[] = [];

      rows.forEach((row, index) => {
        const rowErrors = validateImportRow(row, staffMembers);
        if (rowErrors.length > 0) {
          errors.push(`Row ${index + 2}: ${rowErrors.join(', ')}`);
        } else {
          validRows.push(row);
        }
      });

      if (errors.length > 0) {
        alert('Import validation errors:\n\n' + errors.join('\n'));
        return;
      }

      const newStaff = validRows.map(row => ({
        name: row.name,
        role: row.role,
        start_date: convertUKDateToISO(row.start_date),
        end_date: row.end_date ? convertUKDateToISO(row.end_date) : null,
        training_hours: row.training_hours,
        department: row.department,
        notes: row.notes || null,
        site_id: null,
        is_archived: false
      }));

      const { data, error } = await supabase.from('staff_members').insert(newStaff).select();
      if (error) throw error;

      // Log import audit
      await supabase.from('people_tracker_audit_log').insert({
        table_name: 'staff_members',
        record_id: data[0].id,
        action: 'IMPORT',
        new_data: { count: newStaff.length, file: file.name }
      });

      setShowImportModal(false);
      await loadData();
      alert(`Successfully imported ${newStaff.length} staff members!`);
    } catch (err: any) {
      console.error('Error importing staff:', err);
      alert('Failed to import staff: ' + err.message);
    }
  };

  const handleExport = async () => {
    try {
      // Log export audit
      await supabase.from('people_tracker_audit_log').insert({
        table_name: 'staff_members',
        record_id: '00000000-0000-0000-0000-000000000000',
        action: 'EXPORT',
        new_data: { count: filteredStaff.length }
      });

      exportToCSV(filteredStaff, currentHourlyRate);
      alert('Staff data exported successfully!');
    } catch (err: any) {
      console.error('Error exporting staff:', err);
      alert('Failed to export staff: ' + err.message);
    }
  };

  const Tooltip = ({ text }: { text: string }) => (
    <div className="group relative inline-block ml-1">
      <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
      <div className="invisible group-hover:visible absolute z-50 w-64 p-2 mt-1 text-sm bg-gray-900 text-white rounded shadow-lg -left-1/2 transform -translate-x-1/2">
        {text}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading people tracker...</div>
      </div>
    );
  }

  const departments = getUniqueDepartments(staffMembers);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">People Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">Team retention, training costs & workforce analytics</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => downloadSampleTemplate()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Template
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Config
          </button>
          <button
            onClick={() => setShowBenchmarkModal(true)}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center gap-2"
            title="Edit industry benchmark rates"
          >
            <TrendingUp className="w-4 h-4" />
            Benchmarks
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Staff
          </button>
        </div>
      </div>

      {/* Period Selector & Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Period Selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
            <div className="flex gap-2 flex-wrap">
              {PERIOD_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => setDashboardState({ ...dashboardState, selectedPeriod: preset.label })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    dashboardState.selectedPeriod === preset.label
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setDashboardState({ ...dashboardState, selectedPeriod: 'Custom' })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  dashboardState.selectedPeriod === 'Custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {/* Custom Date Range */}
          {dashboardState.selectedPeriod === 'Custom' && (
            <div className="flex gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  value={dashboardState.customStartDate}
                  onChange={(e) => setDashboardState({ ...dashboardState, customStartDate: e.target.value })}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  value={dashboardState.customEndDate}
                  onChange={(e) => setDashboardState({ ...dashboardState, customEndDate: e.target.value })}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* Status & Department Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              <Filter className="w-4 h-4 mr-1" />
              Staff Status
            </label>
            <div className="flex gap-2">
              {(['all', 'active', 'inactive'] as StaffFilter[]).map(filter => (
                <button
                  key={filter}
                  onClick={() => setDashboardState({ ...dashboardState, filter })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
                    dashboardState.filter === filter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Department Filter</label>
            <div className="flex gap-2 flex-wrap">
              {departments.map(dept => (
                <button
                  key={dept}
                  onClick={() => {
                    const selected = dashboardState.selectedDepartments.includes(dept)
                      ? dashboardState.selectedDepartments.filter(d => d !== dept)
                      : [...dashboardState.selectedDepartments, dept];
                    setDashboardState({ ...dashboardState, selectedDepartments: selected });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    dashboardState.selectedDepartments.includes(dept)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {dept}
                </button>
              ))}
              {dashboardState.selectedDepartments.length > 0 && (
                <button
                  onClick={() => setDashboardState({ ...dashboardState, selectedDepartments: [] })}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 transition"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {/* Turnover Rate */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600 flex items-center">
              Turnover Rate
              <Tooltip text="(Separations ÷ Average Headcount) × 100. Industry standard calculation for measuring employee turnover." />
            </h3>
            <TrendingUp className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.avgHeadcount === 0 ? 'N/A' : `${metrics.turnoverRate.toFixed(1)}%`}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {dashboardState.selectedPeriod} period
          </p>
        </div>

        {/* Retention Rate */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600 flex items-center">
              Retention Rate
              <Tooltip text="(Staff who remained full period ÷ Starting Headcount) × 100. Measures team stability and loyalty." />
            </h3>
            <Users className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.avgHeadcount === 0 ? 'N/A' : `${metrics.retentionRate.toFixed(1)}%`}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {dashboardState.selectedPeriod} period
          </p>
        </div>

        {/* Average Headcount */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600 flex items-center">
              Avg Headcount
              <Tooltip text="(Start Headcount + End Headcount) ÷ 2. Used for accurate turnover calculations." />
            </h3>
            <Users className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.avgHeadcount.toFixed(1)}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Active: {metrics.activeCount} | Inactive: {metrics.inactiveCount}
          </p>
        </div>

        {/* Training Cost */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600 flex items-center">
              Total Training Cost
              <Tooltip text="Total training cost for filtered staff. Archived staff use locked historical rates. Average excludes staff with zero training." />
            </h3>
            <DollarSign className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            £{metrics.totalTrainingCost.toFixed(2)}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Avg £{metrics.avgTrainingCost.toFixed(2)} per trained staff ({metrics.staffWithTrainingCount} staff)
          </p>
        </div>

        {/* Average Training Hours */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600 flex items-center">
              Avg Training Hours
              <Tooltip text="Average training hours per staff member. Only includes staff with training hours > 0. Both active and inactive staff are included if they have training." />
            </h3>
            <Clock className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.avgTrainingHours.toFixed(1)}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {metrics.staffWithTrainingCount} of {filteredStaff.length} staff trained
          </p>
        </div>
      </div>

      {/* Historical Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Training Cost Over Time */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Training Cost Trend (12 Months)
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                formatter={(value: any) => typeof value === 'number' ? `£${value.toFixed(2)}` : value}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="totalTrainingCost" fill="#3b82f6" name="Total Cost (£)" />
              <Line yAxisId="right" type="monotone" dataKey="avgTrainingCost" stroke="#10b981" strokeWidth={2} name="Avg Cost (£)" />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            Total and average training costs per period. Average excludes staff with zero training.
          </p>
        </div>

        {/* Turnover & Retention Rates */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <LineChart className="w-5 h-5 text-red-600" />
              Turnover & Retention Trend
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsLine data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 12 }}
                label={{ value: 'Month / Period', position: 'insideBottom', offset: -5, style: { fontSize: 11, fill: '#666' } }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                label={{ value: 'Rate (%)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#666' } }}
              />
              <RechartsTooltip content={<TurnoverRetentionTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Line type="monotone" dataKey="turnoverRate" stroke="#ef4444" strokeWidth={2} name="Your Turnover Rate (%)" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="retentionRate" stroke="#10b981" strokeWidth={2} name="Your Retention Rate (%)" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <ReferenceLine y={benchmarkTurnoverRate} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" label={{ value: `Industry Avg Turnover (${benchmarkTurnoverRate}%)`, position: 'insideTopRight', fill: '#f59e0b', fontSize: 11 }} />
              <ReferenceLine y={benchmarkRetentionRate} stroke="#6366f1" strokeWidth={2} strokeDasharray="5 5" label={{ value: `Industry Avg Retention (${benchmarkRetentionRate}%)`, position: 'insideBottomRight', fill: '#6366f1', fontSize: 11 }} />
            </RechartsLine>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            <strong>Period-specific calculations:</strong> Each month shows turnover and retention rates calculated for that specific period window. Hover over data points for detailed calculation breakdown.
            <br />
            UK Sushi Chef Hospitality benchmarks: Turnover {benchmarkTurnoverRate}%, Retention {benchmarkRetentionRate}%.
            <button onClick={() => setShowBenchmarkModal(true)} className="text-blue-600 hover:underline ml-1">Edit benchmarks</button>
          </p>
        </div>

        {/* Training Cost vs Turnover */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Training Cost vs Turnover
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: '£', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} label={{ value: '%', angle: 90, position: 'insideRight' }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="avgTrainingCost" fill="#8b5cf6" name="Avg Training Cost (£)" />
              <Line yAxisId="right" type="monotone" dataKey="turnoverRate" stroke="#ef4444" strokeWidth={2} name="Turnover Rate (%)" />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            Correlation between training investment and staff turnover. Higher training may reduce turnover.
          </p>
        </div>

        {/* Team Composition Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-green-600" />
              Team Composition
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPie>
              <Pie
                data={[
                  { name: 'Active Staff', value: metrics.activeCount, color: '#10b981' },
                  { name: 'Inactive Staff', value: metrics.inactiveCount, color: '#6b7280' }
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                <Cell fill="#10b981" />
                <Cell fill="#6b7280" />
              </Pie>
              <RechartsTooltip />
              <Legend />
            </RechartsPie>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{metrics.activeCount}</div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{metrics.inactiveCount}</div>
              <div className="text-sm text-gray-600">Inactive</div>
            </div>
          </div>
        </div>

        {/* Headcount & Separations Trend */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Headcount & Separations Trend (12 Months)
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
              />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="avgHeadcount" fill="#93c5fd" stroke="#3b82f6" name="Avg Headcount" />
              <Bar yAxisId="right" dataKey="separations" fill="#f87171" name="Separations" />
              <Line yAxisId="left" type="monotone" dataKey="activeCount" stroke="#10b981" strokeWidth={2} name="Active Staff" />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            Track team size changes, active staff levels, and separation events over time.
          </p>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Staff Members ({filteredStaff.length})
          </h3>
          <div className="text-sm text-gray-500">
            Showing {dashboardState.filter} staff
            {dashboardState.selectedDepartments.length > 0 && ` in ${dashboardState.selectedDepartments.join(', ')}`}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Training Hours</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Training Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStaff.map(staff => {
                const trainingCost = calculateTrainingCost(staff, currentHourlyRate);
                const isActive = !staff.end_date;
                const isRateLocked = staff.rate_locked_at !== null;

                return (
                  <tr key={staff.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{staff.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{staff.role}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{staff.department || 'General'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(staff.start_date).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{staff.end_date ? new Date(staff.end_date).toLocaleDateString('en-GB') : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{staff.training_hours.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      £{trainingCost.toFixed(2)}
                      {isRateLocked && (
                        <Tooltip text={`Rate locked at £${staff.training_rate_applied?.toFixed(2)} on ${new Date(staff.rate_locked_at!).toLocaleDateString('en-GB')}`} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(staff)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(staff)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredStaff.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No staff members found for the selected filters.
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {showEditModal ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h2>
              <button onClick={() => { setShowAddModal(false); setShowEditModal(false); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={showEditModal ? handleUpdateStaff : handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <input
                  type="text"
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Training Hours</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.training_hours}
                  onChange={(e) => setFormData({ ...formData, training_hours: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  {showEditModal ? 'Update Staff' : 'Add Staff'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Training Configuration</h2>
              <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hourly Training Rate (£)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newHourlyRate}
                  onChange={(e) => setNewHourlyRate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Note: Changing this rate will only affect active staff. Inactive staff retain their locked historical rates.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleUpdateHourlyRate}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Update Rate
                </button>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Benchmark Modal */}
      {showBenchmarkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-600" />
                Industry Benchmark Rates
              </h2>
              <button onClick={() => setShowBenchmarkModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>UK Sushi Chef Hospitality Sector (2025)</strong><br />
                  Industry averages: Retention 33%, Turnover 67%.<br />
                  Update these values to match your latest market information or regional benchmarks.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    Industry Avg Retention Rate (%)
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={newRetentionRate}
                    onChange={(e) => setNewRetentionRate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="33"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    % of staff remaining for one year
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    Industry Avg Turnover Rate (%)
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={newTurnoverRate}
                    onChange={(e) => setNewTurnoverRate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="67"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    % of staff leaving each year
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-600">
                  <strong>Note:</strong> Both fields are required and cannot be blank. These benchmark values will be displayed as horizontal reference lines in your Turnover & Retention Trend chart for easy comparison.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleUpdateBenchmarks}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium"
                >
                  Update Benchmarks
                </button>
                <button
                  onClick={() => setShowBenchmarkModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Import Staff Data</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>UK Date Format Required:</strong><br />
                  All dates must be in DD/MM/YYYY format<br />
                  Example: 25/12/2024<br />
                  <br />
                  <strong>CSV Columns:</strong><br />
                  name, role, start_date, end_date, training_hours, department, notes
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select CSV File
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => downloadSampleTemplate()}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium"
                >
                  Download Template
                </button>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
