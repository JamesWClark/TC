// essential reads:
// http://stackoverflow.com/a/13016081/1161948
// https://developers.google.com/identity/sign-in/web/backend-auth#send-the-id-token-to-your-server

var app = angular.module('tc',[]);

app.controller('tcc', function($scope, $window, $http, $compile) {
    
    var auth2;
    
    $scope.user = {};
    
    var log = function(msg, obj) {
        if(obj) {
            try {
                console.log(msg + JSON.stringify(obj));
            } catch(err) {
                var simpleObject = {};
                for (var prop in obj ){
                    if (!obj.hasOwnProperty(prop)){
                        continue;
                    }
                    if (typeof(obj[prop]) == 'object'){
                        continue;
                    }
                    if (typeof(obj[prop]) == 'function'){
                        continue;
                    }
                    simpleObject[prop] = obj[prop];
                }
                console.log('c-' + msg + JSON.stringify(simpleObject)); // returns cleaned up JSON
            }        
        } else {
            console.log(msg);
        }
    };
    
    $window.appStart = function() {
        console.log('appStart()');
        gapi.load('auth2', initSigninV2);
    };

    var initSigninV2 = function() {
        console.log('initSigninV2()');
        auth2 = gapi.auth2.getAuthInstance();
        auth2.isSignedIn.listen(signinChanged);
        auth2.currentUser.listen(userChanged);

        if(auth2.isSignedIn.get() == true) {
            auth2.signIn();
        }
    };

    var signinChanged = function(isSignedIn) {
        console.log('signinChanged() = ' + isSignedIn);
        
        if(isSignedIn) {
            console.log('user signed in');
            var googleUser = auth2.currentUser.get();
            var authResponse = googleUser.getAuthResponse();
            var profile = googleUser.getBasicProfile();
            $scope.user.userid      = profile.getId();
            $scope.user.fullName    = profile.getName();
            $scope.user.firstName   = profile.getGivenName();
            $scope.user.lastName    = profile.getFamilyName();
            $scope.user.photo       = profile.getImageUrl();
            $scope.user.email       = profile.getEmail();
            $scope.user.domain      = googleUser.getHostedDomain();
            $scope.user.idToken     = authResponse.id_token;
            $scope.user.expiresAt   = authResponse.expires_at;
            $scope.$digest();
            
            _post('/signin', $scope.user, function(response) {
                if(response.data.options.superadmin === true) {
                    console.log('superadmin!');
                    $scope.user.superadmin = true;
                }
                $scope.user.courses = response.data.courses;
                $scope.view = 'list-courses';
            });
            
        } else {
            console.log('user is not signed in');
            $scope.user = {};
            $scope.view = 'signin';
            $scope.$digest();
        }
    };

    var userChanged = function(user) {
        console.log('userChanged() = ' + JSON.stringify(user));
    };
    
    $scope.signOut = function() {
        auth2.signOut();
        console.log('signOut()');
        console.log(auth2);
    };
    
    $scope.disconnect = function() {
        auth2.disconnect();
        console.log('disconnect()');
        console.log(auth2);
    };
    
    $scope.getModal = function(id) {
        switch(id) {
            case 'create-course':
                console.log('get modal-create-course');
                angular.element('#modal-create-course').show();
                break;
            case 'join-course':
                console.log('get modal-join-course called');
                angular.element('#modal-join-course').show();
                break;
        }
    };
    
    $scope.hide = function(ele) {
        angular.element(ele).hide();
    };
    
    $scope.createCourse = function() {
        console.log('create course = ' + $scope.newCourse);
        _post('/course', $scope.newCourse, function(response) {
            // should make a spinning button on top of the create click that waits for the post to return before hiding the modal
            angular.element('#modal-create-course').hide();
            $scope.user.courses.push(response.data);
            $scope.formCreateCourse.$setPristine();
            $scope.newCourse = {};
            log('created course = ', response.data);
        });
    };
    
    $scope.joinCourse = function(token) {
        console.log('trying to join course with token = ' + token);
        var url = '/join/course';
        _post(url, token, function(response) {
            log('joining with token ' + token + ', response.data = ', response.data);
        });
    };
    
    var _post = function(url, data, callback) {
        var permission = {
            userid : $scope.user.userid,
            idToken : $scope.user.idToken
        };
        var authdata = {
            a : permission,
            d : data
        };
        $http.post(url, authdata).then(
        function onSuccess(response) {
            if(response.status === 201 || response.status === 200) {
                console.log('generic post success with status = ' + response.status);
                callback(response);
            } else {
                console.log('expected 200 or 201, got ' + response.status + ' instead');
            }
        }, 
        function onError(response) {
            console.log('error = ' + JSON.stringify(response));
        });
    };
    
    angular.element('.datepicker').datepicker();
    angular.element('input').attr('autocomplete','off');

});

