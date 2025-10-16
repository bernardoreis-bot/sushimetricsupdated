import { useEffect, useState } from 'react';
import { Users, TrendingUp, TrendingDown, Clock, DollarSign, Plus, X, Settings, Calendar, Archive } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface StaffMember {
  id: string;
  site_id: string;
  name: string;
  role: string;
  start_date: string;
  end_date: string | null;
  training_hours: number;
  is_archived: boolean;
}

interface TurnoverMetrics {
  turnoverRate: number;
  separations: number;
  averageHeadcount: number;
  trend: 'up' | 'down' | 'neutral';
  previousRate: number;
}

interface TrainingMetrics {
  averageHours: number;
  totalCost: number;
  hourlyRate: number;
  staffWithTrainingCount: number;
}

export default function PeopleTracker() {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [turnoverMetrics, setTurnoverMetrics] = useState<TurnoverMetrics>({
    turnoverRate: 0,
    separations: 0,
    averageHeadcount: 0,
    trend: 'neutral',
    previousRate: 0
  });
  const [trainingMetrics, setTrainingMetrics] = useState<TrainingMetrics>({
    averageHours: 0,
    totalCost: 0,
    hourlyRate: 12.21,
    staffWithTrainingCount: 0
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    start_date: '',
    end_date: '',
    training_hours: ''
  });
  const [newHourlyRate, setNewHourlyRate] = useState('12.21');
  const [selectedPeriod, setSelectedPeriod] = useState(90);

  useEffect(() => {
    loadData();
  }, [selectedPeriod, showArchived]);

  const loadData = async () => {
    try {
      setLoading(true);

      console.log('Loading people tracker data...');

      const { data: staff, error: staffError } = await supabase
        .from('staff_members')
        .select('*')
        .order('created_at', { ascending: false });

      if (staffError) {
        console.error('Error loading staff members:', staffError);
        if (staffError.message.includes('row-level security')) {
          alert(
            'Permission denied: Unable to load staff members. ' +
            'Please contact your administrator to check Row Level Security (RLS) policies. ' +
            'Error: ' + staffError.message
          );
        }
        throw staffError;
      }

      console.log(`Loaded ${staff?.length || 0} staff members`);

      const { data: config, error: configError } = await supabase
        .from('training_config')
        .select('*')
        .is('site_id', null)
        .maybeSingle();

      if (configError) {
        console.error('Error loading training config:', configError);
        if (configError.message.includes('row-level security')) {
          alert(
            'Permission denied: Unable to load training configuration. ' +
            'Please contact your administrator to check Row Level Security (RLS) policies. ' +
            'Error: ' + configError.message
          );
        }
        throw configError;
      }

      console.log('Training config loaded:', config);

      if (staff) {
        setStaffMembers(staff);
        calculateTurnoverMetrics(staff);
        calculateTrainingMetrics(staff, config?.hourly_rate || 12.21);
      }

      if (config) {
        setTrainingMetrics(prev => ({ ...prev, hourlyRate: config.hourly_rate }));
        setNewHourlyRate(config.hourly_rate.toString());
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error loading people tracker data:', err);
      setLoading(false);
    }
  };

  const calculateTurnoverMetrics = (staff: StaffMember[]) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - selectedPeriod);

    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - selectedPeriod);
    const previousEndDate = new Date(startDate);

    const separations = staff.filter(s => {
      if (!s.end_date) return false;
      const endDateObj = new Date(s.end_date);
      return endDateObj >= startDate && endDateObj <= endDate;
    }).length;

    const previousSeparations = staff.filter(s => {
      if (!s.end_date) return false;
      const endDateObj = new Date(s.end_date);
      return endDateObj >= previousStartDate && endDateObj <= previousEndDate;
    }).length;

    const activeAtStart = staff.filter(s => {
      const startDateObj = new Date(s.start_date);
      return startDateObj <= startDate && (!s.end_date || new Date(s.end_date) >= startDate);
    }).length;

    const activeAtEnd = staff.filter(s => {
      const startDateObj = new Date(s.start_date);
      return startDateObj <= endDate && (!s.end_date || new Date(s.end_date) >= endDate);
    }).length;

    const averageHeadcount = (activeAtStart + activeAtEnd) / 2;
    const previousAverageHeadcount = staff.filter(s => {
      const startDateObj = new Date(s.start_date);
      return startDateObj <= previousEndDate && (!s.end_date || new Date(s.end_date) >= previousStartDate);
    }).length;

    const turnoverRate = averageHeadcount > 0 ? (separations / averageHeadcount) * 100 : 0;
    const previousRate = previousAverageHeadcount > 0 ? (previousSeparations / previousAverageHeadcount) * 100 : 0;

    let trend: 'up' | 'down' | 'neutral' = 'neutral';
    if (turnoverRate > previousRate + 5) trend = 'up';
    else if (turnoverRate < previousRate - 5) trend = 'down';

    setTurnoverMetrics({
      turnoverRate,
      separations,
      averageHeadcount,
      trend,
      previousRate
    });
  };

  const calculateTrainingMetrics = (staff: StaffMember[], hourlyRate: number) => {
    const archivedStaff = staff.filter(s => s.is_archived && s.training_hours > 0);

    const totalTrainingHours = archivedStaff.reduce((sum, s) => sum + s.training_hours, 0);
    const averageHours = archivedStaff.length > 0 ? totalTrainingHours / archivedStaff.length : 0;
    const totalCost = staff.filter(s => s.training_hours > 0)
      .reduce((sum, s) => sum + (s.training_hours * hourlyRate), 0);

    setTrainingMetrics({
      averageHours,
      totalCost,
      hourlyRate,
      staffWithTrainingCount: staff.filter(s => s.training_hours > 0).length
    });
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const newStaff = {
        name: formData.name,
        role: formData.role,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        training_hours: parseFloat(formData.training_hours) || 0,
        site_id: null,
        is_archived: false
      };

      console.log('Attempting to add staff member:', newStaff);

      const { data, error } = await supabase.from('staff_members').insert([newStaff]).select();

      if (error) {
        console.error('Database error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

        if (error.message.includes('row-level security')) {
          throw new Error(
            'Permission denied: Unable to add staff member due to security policy. ' +
            'Please contact your administrator to check Row Level Security (RLS) policies on the staff_members table. ' +
            'Error details: ' + error.message
          );
        }

        throw error;
      }

      console.log('Staff member added successfully:', data);

      setFormData({ name: '', role: '', start_date: '', end_date: '', training_hours: '' });
      setShowAddModal(false);
      await loadData();
      alert('Staff member added successfully!');
    } catch (err: any) {
      console.error('Error adding staff member:', err);
      alert('Failed to add staff member: ' + err.message);
    }
  };

  const handleUpdateHourlyRate = async () => {
    try {
      const rate = parseFloat(newHourlyRate);
      if (isNaN(rate) || rate < 0) {
        alert('Please enter a valid hourly rate (must be a positive number)');
        return;
      }

      console.log('Attempting to update hourly rate to:', rate);

      const { data: existing, error: selectError } = await supabase
        .from('training_config')
        .select('id')
        .is('site_id', null)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing config:', selectError);
        throw new Error('Failed to check existing configuration: ' + selectError.message);
      }

      let error;
      let data;

      if (existing) {
        console.log('Updating existing config with id:', existing.id);
        const result = await supabase
          .from('training_config')
          .update({ hourly_rate: rate, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select();
        error = result.error;
        data = result.data;
      } else {
        console.log('Inserting new config');
        const result = await supabase
          .from('training_config')
          .insert({ site_id: null, hourly_rate: rate })
          .select();
        error = result.error;
        data = result.data;
      }

      if (error) {
        console.error('Database error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

        if (error.message.includes('row-level security')) {
          throw new Error(
            'Permission denied: Unable to update training configuration due to security policy. ' +
            'Please contact your administrator to check Row Level Security (RLS) policies on the training_config table. ' +
            'Error details: ' + error.message
          );
        }

        throw error;
      }

      console.log('Hourly rate updated successfully:', data);

      setShowConfigModal(false);
      await loadData();
      alert('Hourly rate updated successfully to £' + rate.toFixed(2));
    } catch (err: any) {
      console.error('Error updating hourly rate:', err);
      alert('Failed to update hourly rate: ' + err.message);
    }
  };

  const formatUKDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  const displayedStaff = showArchived
    ? staffMembers.filter(s => s.is_archived)
    : staffMembers.filter(s => !s.is_archived);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading people tracker...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">People Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor staff turnover and training costs</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors min-h-[44px]"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden sm:inline">Configure</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:bg-orange-700 transition-colors min-h-[44px]"
          >
            <Plus className="w-5 h-5" />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[30, 90, 180, 365].map(days => (
          <button
            key={days}
            onClick={() => setSelectedPeriod(days)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              selectedPeriod === days
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            {days === 365 ? '1 Year' : `${days} Days`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8 text-orange-500" />
            {turnoverMetrics.trend === 'up' ? (
              <TrendingUp className="w-5 h-5 text-red-500" />
            ) : turnoverMetrics.trend === 'down' ? (
              <TrendingDown className="w-5 h-5 text-green-500" />
            ) : null}
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {turnoverMetrics.turnoverRate.toFixed(1)}%
          </div>
          <div className="text-sm font-medium text-gray-600">Turnover Rate</div>
          <div className="text-xs text-gray-500 mt-2">
            {turnoverMetrics.separations} separations • Avg headcount: {turnoverMetrics.averageHeadcount.toFixed(0)}
          </div>
          {turnoverMetrics.previousRate > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Previous period: {turnoverMetrics.previousRate.toFixed(1)}%
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {trainingMetrics.averageHours.toFixed(1)}
          </div>
          <div className="text-sm font-medium text-gray-600">Avg Training Hours to Solo</div>
          <div className="text-xs text-gray-500 mt-2">
            Based on {trainingMetrics.staffWithTrainingCount} staff with training data
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            £{trainingMetrics.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-sm font-medium text-gray-600">Total Training Cost</div>
          <div className="text-xs text-gray-500 mt-2">
            At £{trainingMetrics.hourlyRate.toFixed(2)}/hr • {trainingMetrics.staffWithTrainingCount} staff
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {showArchived ? 'Archived Staff' : 'Active Staff'}
            </h2>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors min-h-[44px] self-start"
            >
              <Archive className="w-5 h-5" />
              {showArchived ? 'Show Active' : 'Show Archived'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Training Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Training Cost</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No {showArchived ? 'archived' : 'active'} staff members found
                  </td>
                </tr>
              ) : (
                displayedStaff.map(staff => (
                  <tr key={staff.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{staff.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{staff.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatUKDate(staff.start_date)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {staff.end_date ? formatUKDate(staff.end_date) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {staff.training_hours > 0 ? staff.training_hours.toFixed(1) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {staff.training_hours > 0
                        ? `£${(staff.training_hours * trainingMetrics.hourlyRate).toFixed(2)}`
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Add Staff Member</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role/Department *</label>
                <input
                  type="text"
                  required
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Training Hours to Solo (Optional)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.training_hours}
                  onChange={e => setFormData({ ...formData, training_hours: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 min-h-[44px]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:bg-orange-700 transition-colors min-h-[44px]"
                >
                  Add Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Training Cost Configuration</h3>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-gray-400 hover:text-gray-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Training Rate (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newHourlyRate}
                  onChange={e => setNewHourlyRate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 min-h-[44px]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This rate is used to calculate training costs for all staff members
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateHourlyRate}
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:bg-orange-700 transition-colors min-h-[44px]"
                >
                  Update Rate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
