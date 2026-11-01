/**
 * @jest-environment jsdom
 */

describe('utils', () => {

  const utils = require('../utils');

  describe('formatString', () => {
    it('should return same string without variables', function () {
      const string = 'Farouq Nadeeb';
      expect(utils.formatString(string, {}))
          .toEqual(string);
    });

    it('should replace alphanumeric variables', function () {
      const name = 'Farouq';
      const lastName = 'Nadeeb';
      expect(utils.formatString('{name} {lastName}', {
        name, lastName,
      })).toEqual(`${name} ${lastName}`);
    });

    it('should replace kebab-case variables', function () {
      const name = 'Farouq';
      const lastName = 'Nadeeb';
      expect(utils.formatString('{name} {last-name}', {
        name, ['last-name']: lastName,
      })).toEqual(`${name} ${lastName}`);
    });

    it('should throw on non-existent variables', function () {
      const name = 'Farouq';
      const lastName = 'Nadeeb';
      expect(() => {
        utils.formatString('{name} {lastName} - born {dob}', {
          name, lastName,
        });
      }).toThrow('Cannot find variable \'dob\' in context');
    });

  });

  describe('filterByKey', () => {
    it('should create object with keys that don\'t start with a string', function () {
      expect(utils.filterByKey({
        removeThis: 'lol',
        removeThat: 'rofl',
        removeAnother: 'do eet!',
        keepMe: 'kept',
        keepThem: 'kept',
      }, (key) => !key.startsWith('remove')))
          .toEqual({
            keepMe: 'kept',
            keepThem: 'kept',
          });
    });

    it('should fail without a filter function', function () {
      expect(() => {
        utils.filterByKey({
          a: true,
          b: true,
        });
      }).toThrow('undefined is not a function');
    });

  });

  describe('matchesSavedMap', () => {
    function test(matchDomainOnly) {
      matchDomainOnly = !!matchDomainOnly;
      return () => {
        describe('without host prefix', () => {
          it('should match url without path', () => {
            expect(
                utils.matchesSavedMap('https://duckduckgo.com', matchDomainOnly, {
                  host: 'duckduckgo.com',
                })
            ).toBe(true);
          });
        });

        function testPrefixes(isRegex) {
          isRegex = !!isRegex;
          const simplePattern = isRegex?
              '@duckduckgo\\.com' : '!duckduckgo.com';
          return () => {
            it('should match url without path', () => {
              expect(
                  utils.matchesSavedMap(
                      'https://duckduckgo.com',
                      matchDomainOnly, {
                        host: simplePattern,
                      })
              ).toBe(true);
            });
            it('should match url with path', () => {
              expect(
                  utils.matchesSavedMap(
                      'https://duckduckgo.com/?q=search+me+baby',
                      matchDomainOnly, {
                        host: simplePattern,
                      })
              ).toBe(true);
            });
            let prefix = matchDomainOnly ? 'should not' : 'should';
            let description = `${prefix} match url with pattern only in path`;
            it(description, () => {
              expect(
                  utils.matchesSavedMap(
                      'https://google.com/?q=duckduckgo',
                      matchDomainOnly, {
                        host: simplePattern,
                      })
              ).toBe(!matchDomainOnly);
            });
          };
        }

        describe('with regex host prefix', testPrefixes(true));
        describe('with glob host prefix', testPrefixes());
      };
    }

    test();
    describe('with matchDomainOnly', test(true));

    describe('uppercase characters', () => {
      it('matches a lowercased regex against uppercase characters in the URL', () => {
        expect(utils.matchesSavedMap(
            'https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&AppName=ImpactEP-EPN',
            false, {
              host: '@https?:\\/{2}signin\\.ebay\\.com\\/.+appname=impactep-epn.*',
            })
        ).toBe(true);
      });

      it('matches a lowercased glob against uppercase characters in the URL', () => {
        expect(utils.matchesSavedMap(
            'https://GitHub.com/User/Repo',
            false, {
              host: '!github.com/user/*',
            })
        ).toBe(true);
      });

      it('matches a lowercased path rule against uppercase characters in the URL', () => {
        expect(utils.matchesSavedMap(
            'https://example.com/Foo/Bar',
            false, {
              host: 'example.com/foo/bar',
            })
        ).toBe(true);
      });

      it('matches a lowercased host against an uppercase host', () => {
        expect(utils.matchesSavedMap(
            'https://Example.COM/Foo',
            false, {
              host: 'example.com',
            })
        ).toBe(true);
      });
    });

  });

});
