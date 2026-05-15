import { describe, it, expect } from 'vitest';
import { FileRecord } from '@filetransfer/index.js';

describe('FileRecord', () => {
  it('stores name and size from constructor', () => {
    const fr = new FileRecord('test.txt', 1024);
    expect(fr.name).toBe('test.txt');
    expect(fr.size).toBe(1024);
  });

  it('starts with an empty data buffer', () => {
    const fr = new FileRecord('empty.bin', 0);
    expect(fr.data.length).toBe(0);
    expect(fr.data.bytesAvailable).toBe(0);
  });

  it('data buffer is independent per instance', () => {
    const a = new FileRecord('a.txt', 100);
    const b = new FileRecord('b.txt', 200);
    a.data.writeByte(0x41); // 'A'
    expect(a.data.length).toBe(1);
    expect(b.data.length).toBe(0);
  });

  it('size is the declared size, not the actual data length', () => {
    // Until the transfer completes, the data buffer may have fewer
    // bytes than `size`. `size` reflects what the sender advertised.
    const fr = new FileRecord('partial.bin', 5000);
    fr.data.writeByte(1);
    fr.data.writeByte(2);
    expect(fr.size).toBe(5000);
    expect(fr.data.length).toBe(2);
  });

  it('handles empty filename and zero size', () => {
    const fr = new FileRecord('', 0);
    expect(fr.name).toBe('');
    expect(fr.size).toBe(0);
  });
});
