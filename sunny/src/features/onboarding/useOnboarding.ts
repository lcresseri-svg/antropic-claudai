import { useState, useEffect } from 'react';
import {
  doc, onSnapshot, setDoc, collection, getDocs, query, limit,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { OnboardingData, ONBOARDING_VERSION } from './onboardingTypes';

const FRESH: OnboardingData = {
  completed: false,
  version: ONBOARDING_VERSION,
  currentStep: 0,
  goals: [],
  dataMode: null,
};

export function useOnboarding(uid: string) {
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'users', uid, 'meta', 'onboarding');
    let active = true;

    const unsub = onSnapshot(ref, async snap => {
      if (!active) return;

      if (snap.exists()) {
        setOnboarding(snap.data() as OnboardingData);
        setLoading(false);
        return;
      }

      // Server confirms doc doesn't exist — check for existing transactions
      if (!snap.metadata.fromCache) {
        try {
          const txSnap = await getDocs(query(
            collection(db, 'users', uid, 'transactions'), limit(1),
          ));
          if (!active) return;

          if (!txSnap.empty) {
            // Existing user without onboarding doc — mark completed silently
            const completed: OnboardingData = {
              completed: true,
              version: ONBOARDING_VERSION,
              currentStep: 0,
              goals: [],
              dataMode: null,
            };
            // onSnapshot will fire again with the new doc → loading false
            setDoc(ref, completed);
          } else {
            // Brand-new user
            setOnboarding(FRESH);
            setLoading(false);
          }
        } catch {
          if (!active) return;
          setOnboarding(FRESH);
          setLoading(false);
        }
      }
      // fromCache + !exists: keep loading, wait for server confirmation
    });

    return () => {
      active = false;
      unsub();
    };
  }, [uid]);

  const updateOnboarding = (patch: Partial<OnboardingData>) => {
    setDoc(doc(db, 'users', uid, 'meta', 'onboarding'), patch, { merge: true });
  };

  const completeOnboarding = () => {
    updateOnboarding({ completed: true, completedAt: new Date().toISOString() });
  };

  const skipOnboarding = () => {
    setDoc(doc(db, 'users', uid, 'meta', 'onboarding'), {
      completed: true,
      version: ONBOARDING_VERSION,
      currentStep: 0,
      goals: [],
      dataMode: null,
      skippedAt: new Date().toISOString(),
    });
  };

  return { onboarding, loading, updateOnboarding, completeOnboarding, skipOnboarding };
}
