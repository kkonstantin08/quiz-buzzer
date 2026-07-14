import React from 'react';
import { FileWarning } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface LegalTodoProps {
  id: string;
  description: string;
}

export function LegalTodo({ id, description }: LegalTodoProps) {
  const isDev = import.meta.env.MODE === 'development';

  if (!isDev) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50 my-6 shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <FileWarning className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-900 text-sm tracking-tight">TODO_LEGAL({id})</p>
          <p className="text-sm text-amber-700/90 leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
