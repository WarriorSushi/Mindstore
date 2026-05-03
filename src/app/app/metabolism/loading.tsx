import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
    </div>
  );
}
