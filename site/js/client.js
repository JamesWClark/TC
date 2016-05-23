// essential reads:
// http://stackoverflow.com/a/13016081/1161948
// https://developers.google.com/identity/sign-in/web/backend-auth#send-the-id-token-to-your-server

var app = angular.module('tc',[]);

app.controller('tcc', function($scope, $window, $http) {
    
    var auth2;
    
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
            console.log('if this is printing, the user is signed in');
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
            
            _post('https://sub.local.info/signin', $scope.user);
            
        } else {
            console.log('if this is printing, the user is not signed in');
            $scope.user = {};
            $scope.$digest();
        }
    };

    var userChanged = function(user) {
        console.log('userChanged() = ' + JSON.stringify(user));
    };
    
    $scope.signOut = function() {
        console.log('signOut()');
        auth2.signOut();
        console.log(auth2);
    };
    
    $scope.disconnect = function() {
        console.log('disconnect()');
        auth2.disconnect();
        console.log(auth2);
    };
    
    var _post = function(url, data) {
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
    };
});

