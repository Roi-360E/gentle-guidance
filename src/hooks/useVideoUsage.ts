import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const PLAN_LIMITS: Record<string, number> = {
  free: 100,
  professional: 1000,
  enterprise: Infinity,
};

function getCurrentMonthYear() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useVideoUsage() {
  const { user } = useAuth();
  const [videoCount, setVideoCount] = useState(0);
  const [plan, setPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);

  const monthYear = getCurrentMonthYear();
  const planLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const limit = planLimit;
  const remaining = Math.max(0, limit - videoCount);
  const isLimitReached = limit !== Infinity && videoCount >= limit;

  const fetchUsage = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('video_usage')
      .select('*')
      .eq('user_id', user.id)
      .eq('month_year', monthYear)
      .maybeSingle();

    if (data) {
      setVideoCount(data.video_count);
      setPlan(data.plan);
    } else {
      setVideoCount(0);
      setPlan('free');
    }
    setLoading(false);
  }, [user, monthYear]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const incrementUsage = useCallback(async (count: number) => {
    if (!user) return false;

    const newCount = videoCount + count;
    const currentLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

    if (currentLimit !== Infinity && newCount > currentLimit) {
      return false;
    }

    const { data: existing } = await supabase
      .from('video_usage')
      .select('id, video_count')
      .eq('user_id', user.id)
      .eq('month_year', monthYear)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('video_usage')
        .update({ video_count: existing.video_count + count })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('video_usage')
        .insert({ user_id: user.id, month_year: monthYear, video_count: count, plan: 'free' });
    }

    setVideoCount(prev => prev + count);
    return true;
  }, [user, videoCount, plan, monthYear]);

  return { videoCount, plan, limit, remaining, isLimitReached, loading, incrementUsage, fetchUsage };
}
