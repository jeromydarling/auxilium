import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/app/AppShell';
import { api, type PrayerListItem } from '@/lib/api';
import { relativeDays, cn } from '@/lib/utils';

/**
 * The prayer board.
 *
 * Cards rather than a table, deliberately — these are people, and a dense grid
 * of names encourages processing them as rows. Ordering comes from the server:
 * urgent first, then overdue follow-ups, then newest. Never plain date order,
 * which quietly buries whoever has been waiting longest.
 */
export function PrayerBoardPage() {
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['prayer', status, category],
    queryFn: () => api.prayer.list({ status, category: category || undefined }),
  });

  return (
    <>
      <PageHeader
        title="Prayer board"
        description="Care requests and pastoral follow-up."
      />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-48">
            <option value="">All categories</option>
            <option value="hospitalization">Hospitalization</option>
            <option value="bereavement">Bereavement</option>
            <option value="health">Health</option>
            <option value="birth">Birth</option>
            <option value="financial">Financial</option>
            <option value="family">Family</option>
            <option value="spiritual">Spiritual</option>
            <option value="general">General</option>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the board…</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="font-medium">Nothing on the board.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No open requests match that filter.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((request) => (
              <PrayerCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PrayerCard({ request }: { request: PrayerListItem }) {
  const queryClient = useQueryClient();
  const overdue = request.followup_overdue === 1;
  const urgent = request.is_urgent === 1;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['prayer'] });
    queryClient.invalidateQueries({ queryKey: ['nri'] });
  };

  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border bg-card p-4',
        urgent && 'border-destructive/40',
        !urgent && overdue && 'border-onus/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge variant="muted" className="capitalize">
          {request.category.replace('_', ' ')}
        </Badge>
        <div className="flex gap-1.5">
          {urgent && <Badge variant="destructive">Urgent</Badge>}
          {overdue && (
            <Badge variant="outline" className="border-onus/40 text-onus">
              <Clock className="mr-1 h-3 w-3" /> Follow-up due
            </Badge>
          )}
        </div>
      </div>

      <h3 className="mt-2 font-medium">{request.title}</h3>
      {request.body && (
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{request.body}</p>
      )}

      <div className="mt-2 text-xs text-muted-foreground">
        {request.member_id ? (
          <Link to={`/members/${request.member_id}`} className="hover:underline">
            {request.first_name} {request.last_name}
          </Link>
        ) : (
          <span>No member linked</span>
        )}
        <span> · raised {relativeDays(request.created_at)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {request.assignee_name ? (
            <>Followed by {request.assignee_name}</>
          ) : (
            <span className="text-onus">Nobody following up</span>
          )}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await api.prayer.pray(request.id);
              refresh();
            }}
            title="Record that you prayed for this"
          >
            <Heart className="h-3.5 w-3.5" />
            <span className="tabular">{request.prayer_count}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              // Logging a follow-up clears the overdue flag and schedules the
              // next check-in, so the commitment stays live rather than firing
              // once and disappearing.
              await api.prayer.followUp(request.id, { next_followup_days: 7 });
              refresh();
            }}
          >
            Log follow-up
          </Button>
        </div>
      </div>
    </article>
  );
}
