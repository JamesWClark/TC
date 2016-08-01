// essential reads:
// http://stackoverflow.com/a/13016081/1161948
// https://developers.google.com/identity/sign-in/web/backend-auth#send-the-id-token-to-your-server

var app = angular.module('tc',[]);

app.controller('tcc', function($scope, $window, $http, $compile, $document) {
    
    var auth2;
    var sidenav = false; // displays the sidenav
    
    // set ace editor in modal-create-programming-task
    var editor = ace.edit("editor");
    editor.setTheme("ace/theme/sqlserver");
    editor.getSession().setMode("ace/mode/processing");
    editor.$blockScrolling = Infinity;
    $scope.user = {};
    
    // log to prevent circular reference
    var log = function(msg, obj) {
        console.log('\n');
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
        log('appStart()');
        gapi.load('auth2', initSigninV2);
    };

    var initSigninV2 = function() {
        log('initSigninV2()');
        auth2 = gapi.auth2.getAuthInstance();
        auth2.isSignedIn.listen(signinChanged);
        auth2.currentUser.listen(userChanged);

        if(auth2.isSignedIn.get() == true) {
            auth2.signIn();
        }
    };

    var signinChanged = function(isSignedIn) {
        log('signinChanged() = ' + isSignedIn);
        
        if(isSignedIn) {
            log('user signed in');
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
            
            log('authResponse = ', authResponse);
            log('profile = ', profile);
            
            _post('/signin', $scope.user, function(response) {
                if(response.data.options.superadmin === true) {
                    log('superadmin!');
                    $scope.user.superadmin = true;
                }
                $scope.user.courses = response.data.courses;
                $scope.view = 'list-courses';
            });
            
        } else {
            log('user is not signed in');
            $scope.user = {};
            $scope.view = 'signin';
            $scope.$digest();
        }
    };

    var userChanged = function(user) {
        log('userChanged() = ' + JSON.stringify(user));
    };
    
    $scope.signOut = function() {
        auth2.signOut();
        log('signOut()');
        log(auth2);
    };
    
    $scope.disconnect = function() {
        auth2.disconnect();
        log('disconnect()');
        log(auth2);
    };
    
    $scope.getModal = function(id) {
        switch(id) {
            case 'create-course':
                log('get modal-create-course');
                angular.element('#modal-create-course').show();
                break;
            case 'join-course':
                log('get modal-join-course');
                angular.element('#modal-join-course').show();
                break;
            case 'create-web-snippet':
                log('get modal-create-web-snippet')
                angular.element('#modal-create-web-snippet').show();
                break;
            case 'create-programming-task':
                log('get modal-create-programming-task');
                angular.element('#modal-create-programming-task').show();
                break;
        }
    };
    
    var home = function() {    
        $scope.view = 'list-courses';
        delete $scope.course;
    };
    
    $scope.home = function() {
        home();
    };
    
    $scope.hide = function(ele) {
        angular.element(ele).hide();
    };
    
    $scope.show = function(ele) {
        angular.element(ele).show();
    };
    
    $scope.createCourse = function() {
        log('create course = ', $scope.newCourse);
        _post('/course', $scope.newCourse, function(response) {
            // should make a spinning button on top of the create click that waits for the post to return before hiding the modal
            angular.element('#modal-create-course').hide();
            $scope.user.courses.push(response.data);
            $scope.formCreateCourse.$setPristine();
            $scope.newCourse = {};
            log('created course = ', response.data);
        });
    };
    
    $scope.viewCourse = function(course) {
        log('view course = ', course);
		$scope.course = course;
		$scope.view = 'view-course';
        
        var url = '/course/tasks?cid=' + course._id;
        _get(url, function(response) {
            
        });
    };
    
    $scope.joinCourse = function(token) {
        log('trying to join course with token = ' + token);
        var url = '/join/course';
        _post(url, token, function(response) {
            switch(response.status) {
                case 400:
                    log('fail: ', response.data);
                    $scope.joinError = response.data;
                    break;
                case 404: // join token not found
                    log('fail: course not found with token = ', token);
                    $scope.joinError = 'Course not found.';
                    break;
                case 201: // successfully joined the course
                    log('successfully joined course = ', response.data);
                    $scope.user.courses.push(response.data);
                    angular.element('#modal-join-course').hide();
                    $scope.formJoinCourse.$setPristine();
                    break;
            }
        });
    };
    
    $scope.suspendCourse = function(token) {
        log('suspending course with token = ' + token);
        var url = '/suspend/course';
        _post(url, token, function(response) {
            log('suspendCourse status = ', response.status);
            switch(response.status) {
                case 201: // successfully suspended the course
                    var joinToken = response.data;
                    log('successfully suspended course = ', joinToken);
                    $scope.user.courses = $scope.user.courses.filter(function(obj) {
                        if(obj.joinToken === joinToken) {
                            log('splicing course with joinToken = ', joinToken);
                        }
                        return obj.joinToken !== joinToken;
                    });
                    home();
                    log('$scope.user.courses = ', $scope.user.courses);
                    break;
                case 400:
                    log('suspendCourse 400 error = ', response);
            }
        });
    };
    
    $scope.createWebSnippit = function() {
        log('creating web snippet');
        log(tinymce.activeEditor.getContent()); //#tinymce-create-web-snippet
    };
    
    $scope.createProgrammingTask = function() {
        var task = $scope.newProgrammingTask;
        task.instructions = tinymce.get('tinymce-create-programming-task').getContent();
        task.starterCode = editor.getValue();
        task.courseid = $scope.course._id;
        log('create programming task = ', task);
        _post('/create/programmingtask', task, function(response) {
            angular.element('#modal-create-programming-task').hide();
            $scope.formCreateProgrammingTask.$setPristine();
            $scope.newProgrammingTask = {};
            tinymce.get('tinymce-create-programming-task').setContent('');
            editor.setValue('');
            $scope.mpt_step(0);
            log('created programming task = ', response.data);
        });
    };
    
    // manage tabs for modal-create-programming-task
    $scope.mpt_step = function(n) {
        var numTabs = 2;
        for(var i = 0; i < numTabs; i++) {
            if(i !== n) {
                $scope.hide('#mpt-' + i);
                angular.element('#mpt_tab' + i).removeClass('active');
            } else {
                $scope.show('#mpt-' + i);
                angular.element('#mpt_tab' + i).addClass('active');
            }
        }
        if(angular.element('#mpt_tab1').hasClass('active')) {
            editor.focus();
        } else if (angular.element('#mpt_tab0').hasClass('active')) {
            tinymce.execCommand('mceFocus',false,'tinymce-create-programming-task');
        }
    };
    
    // called by all clicks
    angular.element($document).click(function(e) {
        if(e.target.id !== 'sidenav' && e.target.id !== 'three-bars') {
            angular.element('#sidenav').hide();
        }
    });
        
    // generic http post
    var _post = function(url, data, callback) {
        var userid = $scope.user.userid;
        var idToken = $scope.user.idToken;
        var params = '?userid=' + userid + '&idToken=' + idToken; 
        url = url + params;
        $http.post(url, data).then(
            function onSuccess(response) {
                log('_post success = ', response);
                callback(response);
            },
            function onError(error) {
                log('_post error = ', error);
                callback(error);
            }
        );
    };
    
    var _get = function(url, callback) {
        $http.get(url).then(
            function onSuccess(response) {
                log('_get success = ', response);
                callback(response);
            },
            function onError(error) {
                log('_get error = ', error);
                callback(error);
            }
        );
    };
    
    angular.element('.datepicker').datepicker();
    angular.element('input').attr('autocomplete','off');
    
    // initialize tinymce - web snippet
    tinymce.init({
        selector: '#tinymce-create-web-snippet',
        height: 375,
        plugins: [
            'advlist autolink lists link image charmap print preview anchor',
            'searchreplace visualblocks code fullscreen',
            'insertdatetime media table contextmenu paste code'
        ],
        toolbar: 'insertfile undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image'
    });
    
    // initialize tinymce in modal-create-programming-task instructions
    tinymce.init({
        selector: '#tinymce-create-programming-task',
        height: 375,
        plugins: [
            'advlist autolink lists link image charmap print preview anchor',
            'searchreplace visualblocks code fullscreen',
            'insertdatetime media table contextmenu paste code'
        ],
        toolbar: 'insertfile undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image'
    });

    // unhide the first tab on modal-create-programming-task
    $scope.mpt_step(0);
});
