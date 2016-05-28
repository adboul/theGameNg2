(function(){
    'use strict'

    angular.module('theGame')
        .directive('hasRole', [
            'UserService', 
            hasRole
        ])
        .directive('hasLevel', [
            'UserService', 
            hasLevel
        ])
        .directive('isAuth', [
            'UserService', 
            isAuth
        ]);

    function hasRole(UserService) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                var setVisible = function () {
                        element.removeClass('hidden');
                    },
                    setHidden = function () {
                        element.addClass('hidden');
                    },
                    defineVisibility = function (reset) {
                        var result;
                        if (reset) {
                            setHidden();
                        }
                        UserService.hasRole(roles).then(function(result) {
                            if (result) {
                                setVisible();
                            } else {
                                setHidden();
                            }
                        });
                    },
                    roles = attrs.hasRole.replace(/\s+/g, '').split(';');

                if (roles.length > 0) {
                    defineVisibility(true);
                }
            }
        };
    }

     function hasLevel(UserService) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                var setVisible = function () {
                        element.removeClass('hidden');
                    },
                    setHidden = function () {
                        element.addClass('hidden');
                    },
                    defineVisibility = function (reset) {
                        var result;
                        if (reset) {
                            setHidden();
                        }
                        UserService.hasLevel(level).then(function(result) {
                            if (result) {
                                setVisible();
                            } else {
                                setHidden();
                            }
                        });
                    },
                    level = Number(attrs.hasLevel);

                defineVisibility(true);
            }
        };
    }

    function isAuth(UserService) {
        return {
            restrict: 'A',
            scope: {
                rule: '=isAuth'
            },
            link: function (scope, element, attrs) {
                var setVisible = function () {
                        element.removeClass('hidden');
                    },
                    setHidden = function () {
                        element.addClass('hidden');
                    },
                    defineVisibility = function (reset) {
                        var result;
                        if (reset) {
                            setHidden();
                        }

                        UserService.isAuthenticated().then(function(result) {
                            if (result === scope.rule) {
                                setVisible();
                            } else {
                                setHidden();
                            }
                        });
                    }

                defineVisibility(true);
            }
        };
    }


})();