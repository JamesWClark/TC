// essential reads:
// http://stackoverflow.com/a/13016081/1161948
// https://developers.google.com/identity/sign-in/web/backend-auth#send-the-id-token-to-your-server

var app = angular.module('tc',[]);

app.controller('tcc', function($scope, $window, $http, $compile) {
    
    $scope.test = [1,2,3];
    
    var auth2;
    var content = angular.element('#main');
    var login   = angular.element('#login');
    
    $scope.user = {};
    
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
            
            _post('/signin', $scope.user, function() {
                $http.get('parts/top-nav.html').then(function(response) {
                    login.hide();
                    content.html(response.data);
                    $compile(content)($scope);
                });
            });
            
        } else {
            console.log('user is not signed in');
            $scope.user = {};
            $scope.$digest();
            content.html('');
            login.show();
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
    
    var _post = function(url, data, next) {
        $http.post(url, data).then(
        function onSuccess(response) {
            if(response.status === 201) {
                console.log('successfully created document');
            } else {
                console.log('expected 201, got ' + response.status + ' instead');
            }
        }, 
        function onError(response) {
            console.log('error = ' + JSON.stringify(response));
        });
        next();
    };
});

