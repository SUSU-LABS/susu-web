import { RouterProvider } from 'react-router-dom';
import { Suspense } from 'react';
import { DotLoader } from 'react-spinners';
import router from '@/routes/router';

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <DotLoader color="#6d5acf" size={72} />
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}

export default App;
