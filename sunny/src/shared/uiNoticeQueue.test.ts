import { describe, expect, it } from 'vitest';
import { createNoticeQueue } from './uiNoticeQueue';
describe('UI3 presentation queue',()=>{
  it('defers notices behind editors and keeps them eligible after close',()=>{
    const queue=createNoticeQueue(); const leave=queue.enter('editor',null);
    const dismiss=queue.enter('release',30);
    expect(queue.snapshot()).toBe(null); leave();
    expect(queue.snapshot()).toBe('release'); dismiss(); expect(queue.snapshot()).toBe(null);
  });
  it('presents only the highest priority notice, without consuming deferred ones',()=>{
    const queue=createNoticeQueue(); queue.enter('push',10); queue.enter('recap',20);
    const done=queue.enter('whatsnew',30);
    expect(queue.snapshot()).toBe('whatsnew'); done(); expect(queue.snapshot()).toBe('recap');
  });
  it('notifies subscribers on registration and cleanup, cleanup is idempotent',()=>{
    const queue=createNoticeQueue(); let notifications=0;
    const unsubscribe=queue.subscribe(()=>notifications++); const leave=queue.enter('release',1);
    leave(); leave(); expect(notifications).toBe(2); unsubscribe(); queue.enter('new',1); expect(notifications).toBe(2);
  });
});
