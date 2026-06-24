import { TestBed } from '@angular/core/testing';
import { TokenStore } from './token-store';

describe('TokenStore', () => {
  beforeEach(() => localStorage.clear());

  it('persists and clears the token', () => {
    const store = TestBed.inject(TokenStore);

    store.set('abc');
    expect(store.token()).toBe('abc');
    expect(localStorage.getItem('jl_token')).toBe('abc');

    store.clear();
    expect(store.token()).toBeNull();
    expect(localStorage.getItem('jl_token')).toBeNull();
  });
});
