// app/workout/[id]/page.tsx
import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { WorkoutLoader } from "./loader";

export default function ActiveWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <WorkoutLoader paramsPromise={params} />
    </Suspense>
  );
}
