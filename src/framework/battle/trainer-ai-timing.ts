/** Small host adapter; flow receives only the portable timing capability. */
import type { TrainerAiTiming } from '../rules/trainer-ai-strategy';
export const trainerAiTiming:TrainerAiTiming={
  now:()=>performance.now(),
  after(milliseconds,callback){
    const timer=setTimeout(callback,milliseconds);
    return ()=>clearTimeout(timer);
  },
};
