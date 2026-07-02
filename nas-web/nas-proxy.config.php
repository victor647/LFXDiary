<?php
return array(
    'lan' => array(
        'base_url' => getenv('LFX_DIARY_NAS_LAN_URL') ?: 'https://127.0.0.1:5001/',
        'verify_tls' => false,
    ),
    'public' => array(
        'base_url' => getenv('LFX_DIARY_NAS_PUBLIC_URL') ?: 'https://www.lafaxi647.cn:5001/',
        'verify_tls' => true,
    ),
);
